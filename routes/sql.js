const express = require('express');
const router = express.Router();
const fb = require('firebird');
const FetchStream = require('fetch').FetchStream;
const Iconv = require('iconv').Iconv;
const Buffer = require('buffer').Buffer;
const fs = require('fs');
const path = require('path');
const jexcel = require('xls-write');
const chokidar = require('chokidar');
const readXlsxFile = require('read-excel-file/node');
const watcher = chokidar.watch('public/price/price.xlsx', {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
});
let isWatch = false;
let information = {status: true, info: ''};

/* GET users listing. */
router
    .get('/', (req, res, next) => {

      res.send('respond with a resource');
    })
    .post('/select', (req, res) => {
        const { opt, sql} = req.body;
        select(opt, sql)
            .then(d => res.json(d))
            .catch(err => res.json({err: err}));
    })
    .post('/insert', (req, res) => {
        const { opt, sql } = req.body;
        insert(opt, sql)
            .then(d => res.json(d));
    })
    .post('/blob', (req, res) => {
        const { opt, sql, blob } = req.body;
        console.log(sql, blob);
        const conn = fb.createConnection();
        conn.connect(opt.database, opt.user, opt.password, opt.role, (err) => {
            if(err) return res.json({err: err});
            conn.query(sql, (err, qres) => {
                if(err) return res.json({err: err});
                const result = [];
                qres.fetch('all', true, (obj) => {
                    result.push(obj);
                },
                    (err, eof) => {
                        if(err) return res.json({err: err});
                        result.forEach(r => {
                            console.log(r.NUM);
                            r[blob]._readAll((err, obj, len) => {
                                //const conv = new Iconv('windows-1251', 'UTF-8');
                                //const body = conv.convert(obj);
                                const a = obj.toString('base64');
                                //console.log(err, len);
                                conn.disconnect();
                                res.json({err: null, data: a})
                            })
                        });
                    }
                )
            })
        })
    })
    .post('/saveBlob', (req, res) => {
        const { opt, data } = req.body;
        // save(opt, data, (data) => {
        //     res.json({err: null, data: data});
        // });
        insertBlob(opt, data)
            .then(r => res.json({err: null, ok: 1}))
            .catch(err => res.json({err: err, ok: 0}))
    })
    .post('/checkconnection', (req, res) => {
        try{
            const conn = fb.createConnection();
            const { opt } = req.body;
            conn.connect(opt.database, opt.user, opt.password, opt.role, (err) => {
                const r = {
                    err: err ? err.message: null,
                    connected: conn.connected
                };
                res.json(r);
                if (r.connected) {
                    conn.disconnect();
                }
            });
            conn.on('error', (e) => {
                console.error(e)
            })
        }
        catch (e) {
            res.json({
                err: e.message,
                connected: false
            })
        }
    })
    .post('/data', (req, res) => {
        //console.log(req.body);
        let where = '';
        const {opt, data} = req.body;
        if (data) where = ` WHERE TIP = ${data}`;
        //скачиваем базу
        select(opt, 'SELECT NAME, NUM, CENA, CENA_R, CENA_O, DOPOLN1 FROM TOVAR_NAME' + where)
            .then(d => createXLSPrice('price', d.data))
            .then(d => watchPrice(opt, d))
            .then(data => res.json(data))
            .catch(err => res.json({err: err}))
        //создаем xlsx файл
    })
    .get('/status', (req, res) => {
        res.json(information);
        information.info = '';
    })
;

module.exports = router;
//selecte
function select(opt, sql) {
    console.log(sql);
    return new Promise((res, rej) => {
        const conn = fb.createConnection();
        conn.connect(opt.database, opt.user, opt.password, opt.role, (err) => {
            if(err) return res({err: err});
            conn.query(sql, (err, qres) => {
                if(err) return res({err: err});
                const result = [];
                qres.fetch('all', true, (obj) => {
                    result.push(obj);
                },
                    (err, eof) => {
                        conn.disconnect();
                        if(err) return res({err: err});
                        res({err: null, data: result});
                    }
                )
            })
        })
    })
}
//insert
function insert(opt, sql) {
    console.log(sql);
    return new Promise((res, rej) => {
        const { database, user, password, role } = opt;
        const conn = fb.createConnection();
        conn.connectSync(database, user, password, role);
        conn.querySync(sql);
        conn.commitSync();
        //console.log(conn);
        conn.disconnect();
        res({status: 'ok'});
    })
}
//создаем xlsx файл для исправления цен
function createXLSPrice(fileName, arr) {
    return new Promise((res, rej) => {
        information.info = 'Создаем XLSX файл';
        information.status = true;
        const data = {
            sheets: [
                {
                    header: [
                        {NUM: 'NUM'},
                        {NAME: 'NAME'},
                        {CENA: 'CENA'},
                        {CENA_O: 'CENA_O'},
                        {CENA_R: 'CENA_R'},
                        {DOPOLN1: 'DOPOLN1'}
                    ],
                    items: arr,
                    sheetName: 'sheet1',
                }
            ],
            filepath: path.join('public/price/', `${fileName}.xlsx`),
        };
        jexcel.writeXlsx(data);
        res(arr);
    })
}
//следим за изменением в файле
function watchPrice(opt, data) {
    //console.log(watcher);
    // watcher
    //     .on('change', path => console.log(`Файл ${path} был изменен`))
        // .on('add', path => console.log(`Файл ${path} создан`));
    // Add event listeners.
    return new Promise((res, rej) => {
        if (!isWatch) {
            isWatch = true;
            setTimeout(() => {
                information.info = 'XLSX файл создан';
                watcher
                    .on('change', path => {
                        console.log('change');
                        setTimeout(() => {
                            readXlsxFile(path)
                                //сверить старые данные с новыми и вернуть только изменившиеся
                                .then(rows => checkChenges(transformData(rows), data))
                                .then(rows => update(opt, rows))
                                .then(d => res(d))
                                // .then(d => console.log(d))
                                .catch(err => rej(err))
                        }, 3000);
                    })
            }, 5000);
        }
    })
}
//сверяем что изменилось
function checkChenges(newData, oldData) {
    const filds = ['NAME', 'CENA', 'CENA_O', 'CENA_R', 'DOPOLN1'];
    const result = [];
    oldData.forEach((o, i) => {
        let chenge = false;
        const n = newData[i];
        if (o.NUM === n.NUM) {
            //нужно сверить все свойства
            filds.forEach(f => {
                if (!chenge) {
                    if (o[f] !== n[f]) {
                        result.push(n);
                    }
                }
            })
        }
    });
    return result;
}
//преоброзовать данные
function transformData(data) {
    const result = [];
    data.forEach((d, i) => {
        if (i) {
            result.push({NUM: d[0], NAME: d[1], CENA: d[2], CENA_O: d[3], CENA_R: d[4], DOPOLN1: d[5]});
        }
    });
    return result;
}
//обновляем информацию
function update(opt, data) {
    return new Promise((res, rej) => {
        let i = 0;
        setTimeout(start, 5000);
        function start() {
            //information.info = `Процесс обновления цен ${data.length}/${i}`;
            if (data.length === i) {
                //information.info = 'Обновление завершено';
                //information.status = false;
                res('Сохранено');
            }
            else {
                insert(opt, `UPDATE TOVAR_NAME SET CENA = ${data[i].CENA}, 
                        CENA_O = ${data[i].CENA_O}, CENA_R = ${data[i].CENA_R}, DOPOLN1 = ${data[i].DOPOLN1}
                        WHERE NUM = ${data[i].NUM}`)
                    .then(() => {
                            i++;
                            start();
                        })
                    .catch(err => rej(err))
            }
        }
    })
}
//тест
function save(opt, data, cb) {
    const { database, user, password, role } = opt;
    const conn = fb.createConnection();
    conn.connectSync(database, user, password, role);
    const res = conn.querySync(`INSERT INTO TOVAR_IMAGES (TOVAR_ID, TOV_IMAGE, TOV_IMAGE_TYPE, ISORT, DOC_TYPE) VALUES (15550, ?, 'jpg', 1, 102)`);
    res._writeSync(data);
    conn.commitSync();
    // const res = conn.querySync(`SELECT * FROM TOVAR_IMAGES WHERE TOVAR_ID = 15550`);
    // const buf = new Buffer(1024);
    // res._openSync();
    // const len = res._readSync(buf);
    // res._closeSync();
    // const stmt = conn.prepareSync(`INSERT INTO TOVAR_INAGES (TOVAR_ID, TOV_IMAGE, TOV_IMAGE_TYPE, ISORT, DOC_TYPE) VALUES (15550, ?, 'jpg', 1, 102)`);
    // const blob = conn.newBlobSync();
    // const strm = new fb.Stream(blob);
    // conn.disconnect();
    // cb({stmt: stmt, blob: blob, strm: strm});
    conn.disconnect();
    cb('OK');
}

//конвертируем буфер
function convertBuffer(arr) {
    return new Promise((res, rej) => {
        arr.forEach(r => {
            r[blob]._readAll((err, obj, len) => {
                const conv = Iconv('windows-1251', 'utf8');
                const body = conv.convert(obj).toString();
                console.log(err, body, len);
            })
        });
    })
}

function insertBlob(opt, data) {
    return new Promise((res, rej) => {
        const { database, user, password, role } = opt;
        const conn = fb.createConnection();
        conn.connectSync(database, user, password, role);
        var stmt = conn.prepareSync(`INSERT INTO TOVAR_IMAGES (TOVAR_ID, TOV_IMAGE, TOV_IMAGE_TYPE, ISORT, DOC_TYPE) VALUES (${data.TOVAR_ID}, ?, 'jpg', 1, 102)`);
        var blob = conn.newBlobSync();
        var strm = new fb.Stream(blob);
        //test.ok(strm, 'There is a stream');
        var fstrm = new FetchStream(data.URL);
        //console.log(fstrm);
        fstrm.resume();
        fstrm.pipe(strm);
        //console.log(fstrm);
        //console.log(strm);


        strm.on("close", function () {
            stmt.execSync(strm._blob);
            conn.commitSync();
            conn.disconnect();
            res();
        });
        strm.on('error', function (err) {
            rej('error in write blob stream ',err);
        })
    })
}

// var fb  = require("./firebird");
// sys = require("sys");
// var con = fb.createConnection();
// con.connectSync('test.fdb','sysdba','masterkey','');
// con.querySync("insert into test (id,name) values (5, 'new one')");
// var res = con.querySync("select * from test");
// con.commitSync();
// var rows = res.fetchSync("all",true);
// console.log(sys.inspect(rows));