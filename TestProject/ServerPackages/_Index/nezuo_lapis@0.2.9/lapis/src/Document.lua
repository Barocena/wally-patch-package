local freezeDeep = require(script.Parent.freezeDeep)
local Promise = require(script.Parent.Parent.Promise)

local function runCallback(document, name, callback)
	if callback == nil then
		return Promise.resolve()
	end

	document.callingCallback = name

	return Promise.new(function(resolve, reject)
		local ok, message = pcall(callback)

		document.callingCallback = nil

		if not ok then
			reject(`{name} callback threw error: {message}`)
		else
			resolve()
		end
	end)
end

--[=[
	@class Document
]=]
local Document = {}
Document.__index = Document

function Document.new(collection, key, validate, lockId, data, userIds)
	return setmetatable({
		collection = collection,
		key = key,
		validate = validate,
		lockId = lockId,
		data = data,
		userIds = userIds,
		closed = false,
	}, Document)
end

--[=[
	Returns the document's data.

	@return any
]=]
function Document:read()
	return self.data
end

--[=[
	Writes the document's data.

	:::warning
	Throws an error if the document was closed or if the data is invalid.
	:::

	@param data any
]=]
function Document:write(data)
	assert(not self.closed, "Cannot write to a closed document")
	assert(self.validate(data))

	freezeDeep(data)

	self.data = data
end

--[=[
	Adds a user id to the document's `DataStoreKeyInfo:GetUserIds()`. The change won't apply until the document is saved or closed.

	If the user id is already associated with the document the method won't do anything.

	@param userId number
]=]
function Document:addUserId(userId)
	assert(not self.closed, "Cannot add user id to a closed document")

	if table.find(self.userIds, userId) == nil then
		table.insert(self.userIds, userId)
	end
end

--[=[
	Removes a user id from the document's `DataStoreKeyInfo:GetUserIds()`. The change won't apply until the document is saved or closed.

	If the user id is not associated with the document the method won't do anything.

	@param userId number
]=]
function Document:removeUserId(userId)
	assert(not self.closed, "Cannot remove user id from a closed document")

	local index = table.find(self.userIds, userId)

	if index ~= nil then
		table.remove(self.userIds, index)
	end
end

--[=[
	Saves the document's data. If the save is throttled and you call it multiple times, it will save only once with the latest data.

	:::warning
	Throws an error if the document was closed.
	:::

	:::warning
	If the beforeSave callback errors, the returned promise will reject and the data will not be saved.
	:::

	@return Promise<()>
]=]
function Document:save()
	assert(not self.closed, "Cannot save a closed document")
	assert(self.callingCallback == nil, `Cannot save in {self.callingCallback} callback`)

	return runCallback(self, "beforeSave", self.beforeSaveCallback):andThen(function()
		return self.collection.data:save(self.collection.dataStore, self.key, function(value)
			if value.lockId ~= self.lockId then
				return "fail", "The session lock was stolen"
			end

			value.data = self.data

			return "succeed", value, self.userIds
		end)
	end)
end

--[=[
	Saves the document and removes the session lock. The document is unusable after calling. If a save is currently in
	progress it will close the document instead.

	If called again, it will return the promise from the original call.

	:::warning
	If the beforeSave or beforeClose callbacks error, the returned promise will reject and the data will not be saved.
	:::

	@return Promise<()>
]=]
function Document:close()
	assert(self.callingCallback == nil, `Cannot close in {self.callingCallback} callback`)

	if self.closePromise == nil then
		self.closePromise = runCallback(self, "beforeSave", self.beforeSaveCallback)
			:andThenCall(runCallback, self, "beforeClose", self.beforeCloseCallback)
			:finally(function()
				self.closed = true

				self.collection.openDocuments[self.key] = nil

				self.collection.autoSave:removeDocument(self)
			end)
			:andThen(function()
				return self.collection.data:save(self.collection.dataStore, self.key, function(value)
					if value.lockId ~= self.lockId then
						return "fail", "The session lock was stolen"
					end

					value.data = self.data
					value.lockId = nil

					return "succeed", value, self.userIds
				end)
			end)
	end

	return self.closePromise
end

--[=[
	Sets a callback that is run inside `document:save` and `document:close` before it saves. The document can be read and written to in the
	callback.

	The callback will run before the beforeClose callback inside of `document:close`.

	:::warning
	Throws an error if it was called previously.
	:::

	@param callback () -> ()
]=]
function Document:beforeSave(callback)
	assert(self.beforeSaveCallback == nil, "Document:beforeSave can only be called once")

	self.beforeSaveCallback = callback
end

--[=[
	Sets a callback that is run inside `document:close` before it saves. The document can be read and written to in the
	callback.

	:::warning
	Throws an error if it was called previously.
	:::

	@param callback () -> ()
]=]
function Document:beforeClose(callback)
	assert(self.beforeCloseCallback == nil, "Document:beforeClose can only be called once")

	self.beforeCloseCallback = callback
end

return Document
