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

// Configuration of the Scriptae connector. The name of the object is kept from the Zotero Connector it
// is forked from, a lot of code reads it.
const ZOTERO_CONFIG = {
	CLIENT_NAME: 'Scriptae',
	DOMAIN_NAME: 'scriptae.app',
	SETTINGS_URL: 'https://repo.zotero.org/settings',
	// Where the translators (the scripts that read bibliographic data from web pages) come from.
	// This is still Zotero's repository: host our own copy before going to production.
	REPOSITORY_URL: 'https://repo.zotero.org/repo/',
	REPOSITORY_CHECK_INTERVAL: 86400, // 24 hours
	REPOSITORY_RETRY_INTERVAL: 3600, // 1 hour
	REPOSITORY_CHANNEL: 'trunk',
	ALWAYS_FETCH_FROM_REPOSITORY: true,
	BASE_URI: 'https://scriptae.app/',
	WWW_BASE_URL: 'https://scriptae.app/',
	CLIENT_DOWNLOAD_URL: 'https://scriptae.app/',
	// The Scriptae API (a "scriptae-api-url" preference overrides it, see Zotero.API)
	API_URL: 'http://localhost:3000/',
	// The Google Docs integration needs the Zotero desktop app and is not part of Scriptae. Its
	// credentials belong to Zotero and are not shipped.
	GOOGLE_DOCS_API_URL: "",
	OAUTH: {
		GOOGLE_DOCS: {
			AUTHORIZE_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
			ACCESS_URL: 'https://www.googleapis.com/oauth2/v3/tokeninfo',
			CALLBACK_URL: '',
			CLIENT_KEY: '',
		}
	},
	GOOGLE_DOCS_DEV_MODE: false
};
