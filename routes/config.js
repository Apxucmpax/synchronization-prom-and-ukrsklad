const express = require('express');
const router = express.Router();
const jsonfile = require('jsonfile');
const path = require('path');
const fileName = path.join('public/config/', 'groups.json');

router
  .get('/', (req, res) => {
    getConfigGroups(fileName, (err, configGroups) => {
      res.json({err: err, data: configGroups})
    })
  })
  .get('/save', (req, res) => {
    const {num} = req.query;
    if (num) {
      getConfigGroups(fileName, (err, configGroups) => {
        if (err) return res.json({err});
        configGroups[num] = true;
        saveConfig(fileName, configGroups, (err) => {
          res.json({err})
        })
      })
    } else {
      res.json({err: 'Request must have query value num'});
    }
  })
  .post('/save', (req, res) => {
    const { idGroups } = req.body;
    if (idGroups && Array.isArray(idGroups) && idGroups.length) {
      getConfigGroups(fileName, (err, configGroups) => {
        if (err) return res.json({err});
        idGroups.forEach(idGroup => configGroups[idGroup] = true);
        saveConfig(fileName, configGroups, (err) => {
          res.json({err})
        })
      })
    } else {
      res.json({err: 'Request must have body {idGroups: Array}'});
    }
  })
  .get('/delete', (req, res) => {
    const {num} = req.query;
    if (num) {
      getConfigGroups(fileName, (err, configGroups) => {
        delete configGroups[num];
        saveConfig(fileName, configGroups, (err) => {
          res.json({err: err});
        })
      })
    } else {
      res.json({err: 'Request must have query value num'});
    }
  })
;
module.exports = router;
/** Reading the config file
 * @name getConfigGroups
 *
 * @param {string} fileName
 * @param {getConfigGroupsCallback} callback
 */
function getConfigGroups(fileName, callback) {
    jsonfile.readFile(fileName, callback)
}
/** @callback getConfigGroupsCallback
 * @param {Error|null} err
 * @param {configGroups} configGroups
 */

/**
 * @typedef configGroups
 * @type {Object}
 * @property {Boolean} [String] - property id group, value boolean show group or not
 */

/** Add to config file new idGroup
 * @name saveConfig
 *
 * @param {string} fileName
 * @param {configGroups} configGroups
 * @param {saveConfigCallback} callback
 */
function saveConfig(fileName, configGroups, callback) {
  jsonfile.writeFile(fileName, configGroups, callback);
}
/** @callback saveConfigCallback
 * @param {Error|null} err
 */
