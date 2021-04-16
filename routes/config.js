const express = require('express');
const router = express.Router();
const jsonfile = require('jsonfile');
const path = require('path');
const file = path.join('public/config/', 'groups.json');


router
    .get('/', (req, res) => {
        getConfigGroups()
            .then(cfg => res.json(cfg))
            .catch(err => res.json({err: err}));
    })
    .get('/save',(req, res) => {
        const {num} = req.query;
        if (num) {
            addToConfig(num)
                .then(r => res.json(r))
                .catch(err => res.json(err));
        } else {
            res.json({err: 'No data'});
        }
    })
    .get('/delete', (req, res) => {
        const {num} = req.query;
        if (num) {
            deleteToConfig(num)
                .then(r => res.json(r))
                .catch(err => res.json(err));
        } else {
            res.json({err: 'No data'});
        }
    })
;
module.exports = router;

function getConfigGroups() {
    return new Promise((res, rej) => {
        jsonfile.readFile(file, (err, obj) => {
            if (err && (err.code === 'ENOENT')) {
                //файла нет, создаем
                res({err: null, data: {}});
            } else {
                res({err: err, data: obj});
            }
        })
    })
}

function addToConfig(num) {
    return new Promise((res, rej) => {
        getConfigGroups()
            .then(cfg => {
                if (cfg.data) {
                    cfg.data[num] = true;
                    return jsonfile.writeFile(file, cfg.data);
                } else {
                    throw new Error(`Error Data: ${cfg.toString()}`);
                }
            })
            .then(r => res({err: null, data: 'Write complete'}))
            .catch(err => rej({err: err}));
    })
}

function deleteToConfig(num) {
    return new Promise((res, rej) => {
        getConfigGroups()
            .then(cfg => {
                if (cfg.data) {
                    delete cfg.data[num];
                    return jsonfile.writeFile(file, cfg.data);
                } else {
                    throw new Error(`Error Data: ${cfg.toString()}`);
                }
            })
            .then(r => res({err: null, data: 'Delete complete'}))
            .catch(err => rej({err: err}));
    })
}