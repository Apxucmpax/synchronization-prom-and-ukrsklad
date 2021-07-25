/** Service for sending requests to the internal server
 * @constructs
 * @name Service
 *
 * @param {dbOptions} paramObj
 *
 * @return {
 *  .getNestedGroups,
 *  .getConfigGroups,
 *  .addConfigGroup,
 *  .addManyConfigGroups }
 */
function Service(paramObj) {
  this._verificationOptions(paramObj);
  this.options = null;

  Object.defineProperty(this, 'options', {
    value: paramObj,
    enumerable: true,
    configurable: false,
    writable: false
  })
}
/** Parameter validation
 * @method
 * @name Service#_verificationOptions
 *
 * @param {dbOptions} paramsObj
 *
 * @throws {Error} If the params are not valid
 */
Service.prototype._verificationOptions = (paramsObj) => {
  /** @member {Error} Error */
  if (!paramsObj) {
    throw new Error('To connect to the database, the service needs an object with parameters: {\n' +
    '    database: "string",\n' +
    '    user: "string",\n' +
    '    password: "string",\n' +
    '    role: "string"}');
  }
  const { database, user, password, role } = paramsObj;
  if (typeof database !== 'string') throw new Error('database should be type string');
  if (!database.trim()) throw new Error('database should not be empty');
  if (typeof user !== 'string') throw new Error('user should be type string');
  if (!user.trim()) throw new Error('user should not be empty');
  if (typeof password !== 'string') throw new Error('password should be type string');
  if (typeof role !== 'string') throw new Error('role should be type string');
};
/** Returns data from the database by SQL request
 * @async
 * @method
 * @name Service#_getData
 *
 * @param {String} sql
 *
 * @return {Promise<Object>}
 */
Service.prototype._getData = function(sql) {
  return this._getJson('/sql/select', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8'
    },
    body: JSON.stringify({ opt: this.options, sql })
  })
  // fetch('/sql/select', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json;charset=utf-8'
  //   },
  //   body: JSON.stringify({ opt: this.options, sql })})
  //   .then(res => res.json())
  //   .then(data => callback(null, data))
  //   .catch(err => callback(err, null))
};
/** @callback responseGetDataCallback
 * @param {Error|null} err
 * @param {Object} data
 */

/** Returns nested groups
 * @method
 * @name Service#getNestedGroups
 *
 * @param {String} groupId
 * @param {getNestedGroupsCallback} callback
 */
Service.prototype.getNestedGroups = function(groupId, callback) {
  const sql = `SELECT NUM FROM TIP WHERE GRUPA = ${groupId}`;
  this._getData(sql).then(data => {
    if ( data && data.data ) {
      callback(data.data.map(d => d.NUM));
    } else {
      callback([]);
    }
  })
};
/** @callback getNestedGroupsCallback
 * @param {Array} arrayGroupsId
 */

/** get configGroups
 * @async
 * @method
 * @name Service#getConfigGroups
 *
 * @return {Promise<Object>} - return object configGroups
 */
Service.prototype.getConfigGroups = function() {
  return this._getJson('/config', {
    headers: {"Cache-Control": "no-cache"}
  })
};
/** return response fetch request
 * @async
 * @method
 * @name Service#_fetchRequest
 *
 * @param {String} url - the url
 * @param {Object} [options] - options used for query and fetch
 *
 * @return {Promise<Response>}
 * */
Service.prototype._fetchRequest = (url, options = {}) => {
  return fetch(url, options).then(this._checkStatus)
}
/** Checks the response code. Returns the response object if it was successfull.
 * Otherwise it throws an error including the statusText
 * @async
 * @method
 * @name Service#_checkStatus
 *
 * @param {Object} response - A fetch response object with status and statusText as properties.
 *
 * @return {Object} - the response object
 * @throws {String} - the status text
 */
Service.prototype._checkStatus = (response) => {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    const error = new Error(response.statusText)
    error.response = response
    throw error
  }
}
/** Utility to fetch from url, check the responseStatus and parse response as JSON
 * @method
 * @name Service#_getJson
 *
 * @param {String} url - the url
 * @param {Object} [options] - options used for query and fetch
 *
 * @return {Promise<Object>} - the response body wrapped inside a Promise
 */
Service.prototype._getJson = function (url, options) {
  return this._fetchRequest(url, options).then(r => r.json());
}
/** Add in configGroups new group
 * @method
 * @name Service#addConfigGroup
 *
 * @param {String} groupId - add group id
 * @param {addConfigGroupCallback} callback - callback function the response
 */
Service.prototype.addConfigGroup = (groupId, callback) => {
  this._getJson(`/config/save?num=${groupId}`).then(callback)
}
/** @callback addConfigGroupCallback
 * @param {{err: Error|null}} addConfigGroupResponse
 *
 */

/** Add many groups in configGroups
 * @method
 * @name Service#addManyConfigGroups
 *
 * @param {Array} idGroups - add groups id
 * @param {addConfigGroupCallback} callback - callback function the response
 */
Service.prototype.addManyConfigGroups = function(idGroups, callback) {
  this._getJson('/config/save', {
    method: 'POST',
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({idGroups})
  }).then(callback)
}
