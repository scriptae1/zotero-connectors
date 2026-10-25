/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

Zotero.API = new function() {
	const TOKEN_REFRESH_MARGIN = 60 * 1000;
	const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	let refreshing = null;
	
	/**
	 * Address of the Scriptae API, with a trailing slash. The "scriptae-api-url" preference lets a
	 * development build point somewhere else than ZOTERO_CONFIG.API_URL.
	 */
	function _apiURL() {
		let url;
		try {
			url = Zotero.Prefs.get('scriptae-api-url');
		}
		catch (e) {}
		url = url || ZOTERO_CONFIG.API_URL;
		return url.endsWith('/') ? url : url + '/';
	}
	
	/**
	 * Fails with the message of the API when it sent one
	 */
	function _errorFromResponse(xhr, fallback) {
		let message = fallback;
		try {
			let data = JSON.parse(xhr.responseText);
			message = Array.isArray(data.message) ? data.message.join('. ') : (data.message || fallback);
		}
		catch (e) {}
		let error = new Error(message);
		error.status = xhr.status;
		return error;
	}
	
	function _storeSession(session, email) {
		Zotero.Prefs.set('auth-accessToken', session.accessToken);
		if (session.refreshToken) {
			Zotero.Prefs.set('auth-refreshToken', session.refreshToken);
		}
		Zotero.Prefs.set('auth-expiresAt', session.accessTokenExpiresAt);
		if (email) {
			Zotero.Prefs.set('auth-username', email);
		}
	}
	
	/**
	 * Called when the user needs to log in: the form is in the preferences, there is no window to open
	 * from here
	 */
	this.authorize = async function() {
		Zotero.Connector_Browser.openPreferences('general');
		throw new Error('Log in to Scriptae in the extension preferences, then save again.');
	};
	
	/**
	 * Logs in with the credentials of a Scriptae account. The password is not kept, only the tokens.
	 * @returns {Promise<Object>} The user info, as getUserInfo() returns it
	 */
	this.login = async function(email, password) {
		let xhr = await Zotero.HTTP.request("POST", _apiURL() + "auth/token", {
			body: JSON.stringify({ email: email.trim(), password }),
			headers: { "Content-Type": "application/json" },
			successCodes: false
		});
		if (xhr.status === 401) {
			throw new Error('Incorrect email or password.');
		}
		if (xhr.status < 200 || xhr.status >= 300) {
			throw _errorFromResponse(xhr, 'Login failed.');
		}
		_storeSession(JSON.parse(xhr.responseText), email.trim().toLowerCase());
		return this.getUserInfo();
	};
	
	/**
	 * Forgets the tokens of this browser
	 */
	this.clearCredentials = async function() {
		Zotero.Prefs.clear(['auth-accessToken', 'auth-refreshToken', 'auth-expiresAt', 'auth-username']);
	};
	
	/**
	 * Gets the logged in user
	 * @returns {Promise<Object|null>} null when nobody is logged in
	 */
	this.getUserInfo = async function() {
		try {
			let info = await Zotero.Prefs.getAsync(['auth-refreshToken', 'auth-username']);
			if (!info['auth-refreshToken']) return null;
			return { username: info['auth-username'], 'auth-username': info['auth-username'] };
		}
		catch (e) {
			return null;
		}
	};
	
	/**
	 * Gets an access token, renewed when it is about to expire.
	 * @param {Boolean} [force] Renew it even if it looks valid (the API refused it)
	 */
	async function _getAccessToken(force = false) {
		let session;
		try {
			session = await Zotero.Prefs.getAsync(['auth-accessToken', 'auth-refreshToken', 'auth-expiresAt']);
		}
		catch (e) {
			throw new Error('Not authorized');
		}
		if (!session['auth-refreshToken']) throw new Error('Not authorized');
		
		let expiresAt = Number(session['auth-expiresAt']) || 0;
		if (!force && session['auth-accessToken'] && expiresAt - Date.now() > TOKEN_REFRESH_MARGIN) {
			return session['auth-accessToken'];
		}
		
		// concurrent requests share one renewal
		refreshing = refreshing || (async () => {
			let xhr = await Zotero.HTTP.request("POST", _apiURL() + "auth/token/refresh", {
				body: JSON.stringify({ refreshToken: session['auth-refreshToken'] }),
				headers: { "Content-Type": "application/json" },
				successCodes: false
			});
			if (xhr.status === 401) {
				// the refresh token was revoked or has expired: the user has to log in again
				await Zotero.API.clearCredentials();
				throw new Error('Not authorized');
			}
			if (xhr.status < 200 || xhr.status >= 300) {
				throw _errorFromResponse(xhr, 'The session could not be renewed.');
			}
			let renewed = JSON.parse(xhr.responseText);
			_storeSession(renewed);
			return renewed.accessToken;
		})().finally(() => refreshing = null);
		
		return refreshing;
	}
	
	/**
	 * Calls the API with the token of the user, once more with a new token if the first was refused
	 */
	async function _request(method, path, options = {}, askForAuth = true) {
		let token;
		try {
			token = await _getAccessToken();
		}
		catch (e) {
			if (e.message === 'Not authorized' && askForAuth) {
				await Zotero.API.authorize();
			}
			throw e;
		}
		
		let send = (accessToken) => Zotero.HTTP.request(method, _apiURL() + path, {
			...options,
			headers: { ...(options.headers || {}), "Authorization": "Bearer " + accessToken },
			successCodes: false
		});
		
		let xhr = await send(token);
		if (xhr.status === 401) {
			xhr = await send(await _getAccessToken(true));
		}
		if (xhr.status < 200 || xhr.status >= 300) {
			throw _errorFromResponse(xhr, `Scriptae API: ${method} ${path} failed with ${xhr.status}`);
		}
		return xhr;
	}
	
	/**
	 * What the API accepts of an item: the fields are strings, the tags and the creators have a fixed
	 * shape and whatever belongs to Zotero's own sync (keys, versions, relations) is left out.
	 */
	function _toScriptaItem(zoteroItem) {
		const SKIPPED = ['key', 'version', 'parentItem', 'collections', 'relations', 'itemType', 'dateAdded',
			'dateModified', 'deleted', 'inPublications', 'id', 'itemID'];
		let data = {};
		for (let [field, value] of Object.entries(zoteroItem)) {
			if (SKIPPED.includes(field) || value === undefined || value === null) continue;
			if (field === 'tags') {
				let tags = (Array.isArray(value) ? value : [])
					.map(tag => typeof tag === 'string' ? tag : tag && tag.tag)
					.filter(tag => typeof tag === 'string' && tag.trim());
				if (tags.length) data.tags = tags.map(tag => ({ tag: tag.trim().slice(0, 255) }));
			}
			else if (field === 'creators') {
				if (Array.isArray(value) && value.length) data.creators = value;
			}
			else if (field === 'accessDate' && value === 'CURRENT_TIMESTAMP') {
				data.accessDate = new Date().toISOString();
			}
			else if (typeof value === 'object') {
				continue;
			}
			else {
				data[field] = String(value);
			}
		}
		return { itemType: zoteroItem.itemType, data };
	}
	
	/**
	 * Creates items. The payload is what Zotero.Utilities.Item.itemToAPIJSON() produces: a top-level
	 * item followed by its notes, which point to it with `parentItem` (a key made by the connector).
	 * @param {Object[]} payload Items to create
	 * @param {Boolean} [askForAuth] If false, don't ask the user to log in when nobody is
	 * @returns {Promise<String>} A JSON string like Zotero's write API answers:
	 *     {"success": {"0": "<id>"}, "failed": {}}, indexed by the position in the payload
	 */
	this.createItem = async function(payload, askForAuth) {
		let ids = {};
		let result = { success: {}, failed: {} };
		
		for (let [index, zoteroItem] of payload.entries()) {
			let item = _toScriptaItem(zoteroItem);
			if (zoteroItem.parentItem) {
				// A note points to a key made by the connector in this same payload, an attachment to
				// the id the API gave to its parent in a previous call
				let parentId = ids[zoteroItem.parentItem]
					|| (UUID.test(zoteroItem.parentItem) ? zoteroItem.parentItem : null);
				if (!parentId) {
					result.failed[index] = { message: 'The parent item was not created' };
					continue;
				}
				item.parentId = parentId;
			}
			
			try {
				let xhr = await _request('POST', 'library/items', {
					body: JSON.stringify(item),
					headers: { "Content-Type": "application/json" }
				}, askForAuth !== false);
				let created = JSON.parse(xhr.responseText);
				result.success[index] = created.id;
				if (zoteroItem.key) ids[zoteroItem.key] = created.id;
			}
			catch (e) {
				if (e.message === 'Not authorized') throw e;
				Zotero.logError(e);
				result.failed[index] = { message: e.message };
			}
		}
		
		return JSON.stringify(result);
	};
	
	/**
	 * Uploads the file of an attachment item
	 * @param {Object} attachment An attachment object. This object must have the following keys<br>
	 *     data - the attachment contents, as a typed array<br>
	 *     filename - a filename for the attachment<br>
	 *     key - the id of the attachment item, as createItem() returned it<br>
	 *     mimeType - the attachment MIME type
	 */
	this.uploadAttachment = async function(attachment) {
		for (const property of ["data", "key", "mimeType"]) {
			if (!attachment[property]) {
				throw new Error('Required property "' + property + '" not defined');
			}
		}
		if (!/^[0-9a-f-]{36}$/i.test(attachment.key)) {
			throw new Error('Attachment key is invalid');
		}
		
		let form = new FormData();
		form.append('file', new Blob([attachment.data], { type: attachment.mimeType }),
			attachment.filename || 'file');
		// Zotero.HTTP.request turns any other body into JSON; this header makes it send the form as it is
		// and let the browser add the boundary
		await _request('PUT', `library/items/${attachment.key}/file`, {
			body: form,
			headers: { "Content-Type": "multipart/form-data" }
		});
		Zotero.debug("Scriptae API: Upload complete");
		return attachment;
	};
};
