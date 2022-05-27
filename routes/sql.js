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
const xlsx = require('xlsx')
const watcher = chokidar.watch('public/price/price.xlsx', {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
});
let isWatch = false;
const information = {status: true, info: '', err: null, request: null};
const store = {};

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
        let keyWord = '';
        const {opt, data, fields, watch, filename} = req.body;
        if (data) {
            if (data.type === 'group') where = ` AND TIP IN (${data.value.join()})`;
            else if (data.type === 'keyWord') keyWord = ` AND NAME LIKE '%${data.value}%'`;
        }
        console.log('fields', fields);
        //скачиваем базу
        select(opt, `SELECT NUM, NAME, CENA, CENA_R, CENA_O, KOD, CENA_CURR_ID, CENA_OUT_CURR_ID, KOLVO_MIN, CENA_1, CENA_2, ED_IZM${checkField(fields)} FROM TOVAR_NAME WHERE (DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL)` + where + keyWord)
            .then(d => createXLSPrice((filename)?filename:'price', d.data))
            .then(d => {
                if (watch) return watchPrice(opt, d, fields);
                else {
                    information.status = false;
                    return {err: null, data: "Сохранено"}
                }
            })
            .then(data => res.json(data))
            .catch(err => res.json({err: err}))
        //создаем xlsx файл
    })
    .get('/status', (req, res) => {
        console.log(req.query);
        if (req.query) {
            if (req.query.removeRequest) information.request = null;
            if (req.query.saveFile) {
                const {path, fields, opt} = store;
                if (path) {
                    information.info = '...читаю файл'
                    console.log(path, fields);
                    readXlsxFile(path)
                        //сверить старые данные с новыми и вернуть только изменившиеся
                        .then(rows => transformData(rows, fields))
                        .then(rows => update(opt, rows, fields))
                        .then(d => {
                            watcher.close()
                                .then(() => console.log('close'));
                            information.info = d.data;
                            information.status = false;
                        })
                        // .then(d => console.log(d))
                        .catch(err => console.log(err))
                } else {
                    information.err = 'Путь для чтения файла отстутствует';
                }
            }
        } else {
            res.json(information);
        }
    })
    .post('/xlsx', (req, res) => {
        const {data, filename, type} = req.body;
        createXLSPrice((filename)?filename:'default', data, type)
            .then(arr => res.json({err: null, data: 'Сохранино'}))
            .catch(err => res.json({err: err, data: null}))
    })
    .post('/save', (req, res) => {
        const {opt} = req.body;
        readXlsxFile('public\\price\\price.xlsx')
            .then(rows => {
                const rowObj = [];
                let error;
                rows.forEach((r, k) => {
                    if (k) {
                        rowObj.push(getObj(r))
                    } else {
                        error = checkHeader(r);
                    }
                })
                if (rowObj.length && !error) {
                    let i = 0;
                    start();

                    function start() {
                        information.info = `Процесс обновления цен ${rowObj.length}/${i}`;
                        if (i === rowObj.length) res.json({data: 'Обновления сохранены'})
                        else {
                            const sql = `UPDATE TOVAR_NAME SET ${createSetSQL(rowObj[i])} WHERE NUM = ${rowObj[i].NUM}`;
                            insert(opt, sql)
                                .then(() => {
                                    i++;
                                    start()
                                })
                                .catch(err => console.log('error', err))
                        }
                    }

                    function createSetSQL(prod) {
                        let result = '';
                        for (let p in prod) {
                            if (p === 'NUM') {}//не записуем
                            else if((typeof prod[p] === 'string') && (prod[p].indexOf('��') + 1)) {}//ищем вапросительные знаки и не записываем console.log('��', p, prod)
                            else if (!result) result += `${p} = ${checkData(prod[p])}`;
                            else result = result + `, ${p} = ${checkData(prod[p])}`;
                        }
                        return result;
                    }

                    function checkData(data) {
                        if (typeof data === 'string') return `'${data}'`;
                        else if ((typeof data === 'number') || (data === null)) return data;
                        else {
                            console.error(`Wrong data: ${typeof data} ${data}`);
                            return null;
                        }
                    }
                } else if (error) { res.json({err: error});
                } else res.json({err: 'Файл пуст'});
                function getObj(row) {
                    const result = {}
                    rows[0].forEach((d, i) => {
                        result[d] = row[i];
                    });
                    return result;
                }
            })
            .catch(err => console.log(err))
    })
    // .get('/export', (req, res) => {
    //     // const rows = xlsx.readFile('public\\price\\export.xlsx');
    //     // res.json(rows);
    // })
;

module.exports = router;
//check header
function checkHeader(arr) {
    let result = null;
    const allFilds = ['NUM', 'NAME', 'ED_IZM', 'TIP', 'CENA', 'VISIBLE', 'KOD', 'GARAN', 'CENA_R', 'CENA_O', 'CENA_CURR_ID', 'CENA_OUT_CURR_ID', 'DOPOLN', 'IS_USLUGA', 'CENA_1', 'CENA_2', 'TOV_FASOVKA', 'TOV_UPAKOVKA_COUNT', 'TOV_VES', 'TOV_LENGTH', 'TOV_WIDTH', 'TOV_SCANCODE', 'TOV_SCANCODE_IN', 'IS_PRICE_INVISIBLE', 'IS_PDV', 'KOLVO_MIN', 'DOPOLN1', 'DOPOLN2', 'DOPOLN3', 'CENA_3', 'DOPOLN4', 'DOPOLN5', 'TOV_DESCR_BIG', 'IS_COMPL', 'KOD_UKT_ZED', 'IM_NUM', 'IS_IGNOR_ZNIG', 'ANALOG_NUM', 'TOV_PROIZV', 'TOV_HEIGHT', 'ED_IZM2', 'IS_AKCIZ', 'DOC_USER_ID', 'DOC_LAST_USER_ID', 'DOC_CREATE_TIME', 'DOC_MODIFY_TIME', 'KOD_PILGI', 'IS_IMPORT', 'KOD_SG', 'IS_IGNOR_NAC'];
    arr.forEach(fild => {
        if (!(allFilds.indexOf(fild) + 1)) result = `Неподдерживаемое название столбика: ${fild}`;
    });
    return result;
}
//check fields
function checkField(fields) {
    let result = '';
    if (fields && Array.isArray(fields)) {
        fields.forEach(f => {
            if (f) result += result + `, ${f}`;
        })
    }
    return result;
}
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
function createXLSPrice(fileName, arr, type) {
    return new Promise((res, rej) => {
        information.info = 'Создаем XLSX файл';
        information.status = true;
        //console.log(createHeader(arr[0]));
        const data = {
            sheets: [
                {
                    header: (type === 'export')?createHeaderExport():createHeader(arr[0]),
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
//create header export
function createHeaderExport() {
    return [
        {sku: 'Код_товара'},
        {name: 'Название_позиции'},
        {type: 'Тип_товара'},
        {price: 'Цена'},
        {currency: 'Валюта'},
        {unit: 'Единица_измерения'},
        {prices: 'Оптовая_цена'},
        {min_quant: 'Минимальный_заказ_опт'},
        {presence: 'Наличие'},
        {id: 'Уникальный_идентификатор'},
        {group: 'Идентификатор_группы'},
        {external_id: 'Идентификатор_товара'}
    ]
}
//create header
function createHeader(prod) {
    const header = [];
    for (let i in prod) {
        header.push({[i]: i});
    }
    return header;
}
//следим за изменением в файле
function watchPrice(opt, data, fields) {
    //console.log(watcher);
    // watcher
    //     .on('change', path => console.log(`Файл ${path} был изменен`))
        // .on('add', path => console.log(`Файл ${path} создан`));
    // Add event listeners.
    return new Promise((res, rej) => {
        if (!isWatch) {
            isWatch = true;
            setTimeout(() => {
                information.info = '...наблюдаю за изменениями';
                watcher
                    .on('change', path => {
                        console.log('change');
                        store.path = path;
                        store.opt = opt;
                        store.fields = fields;
                        //спросит сохранить изменения в файле?
                        information.request = 'Сохранять изменения в УкрСклад?';
                    });
                res({err: null, data: 'Наблюдение установлено'});
            }, 5000);
        } else {
            res({err: null, data: 'Наблюдение установлено'})
        }
    })
}
//преоброзовать данные
function transformData(data, fields) {
    console.log('transformData');
    //console.log(data.rows);
    if (Array.isArray(data.rows)) console.log(data.rows.length);
    information.info = '...преоброзовую данные';
    const result = [];
    data.rows.forEach((d, i) => {
        //console.log('transformData', d);
        if (i) {
            result.push(getObj(d));
        }
    });
    return result;
    function getObj(row) {
        const result = {}
        data.rows[0].forEach((d, i) => {
            if (checkingFields(d, fields)) result[d] = row[i];
        });
        return result;
    }
    function checkingFields(field, fields) {
        let find = false;
        const defaultFields = ['NUM', 'NAME', 'CENA', 'CENA_R', 'CENA_O', 'KOD', 'CENA_CURR_ID', 'CENA_OUT_CURR_ID', 'KOLVO_MIN', 'CENA_1', 'CENA_2', ...fields];
        defaultFields.forEach(d => {
            if (d === field) find = true;
        });
        return find;
    }
}
//обновляем информацию
function update(opt, data, additionalfields) {
    console.log('update:', data.length);
    information.info = '...обновляю данные';
    return new Promise((res, rej) => {
        let i = 0;
        setTimeout(start, 5000);
        function start() {
            information.info = `Процесс обновления цен ${data.length}/${i}`;
            if (data.length === i) {
                //information.info = 'Обновление завершено';
                //information.status = false;
                res({data: 'Сохранено'})
            } else {
                //const { NUM, NAME, CENA, CENA_O, CENA_R, KOD, CENA_CURR_ID, CENA_OUT_CURR_ID, KOLVO_MIN} = data[i];
                const fields = [];
                //console.log('update', data[0]);
                for (let k in data[0]) {
                    fields.push(k);
                }
                //console.log('update', fields);
                insert(opt, `UPDATE TOVAR_NAME SET ${createSetSQL(data[i], fields)}
                        WHERE NUM = ${data[i].NUM}`)
                    .then(() => {
                            i++;
                            start();
                        })
                    .catch(err => rej(err))
            }
            function createSetSQL(prod, fields) {
                let result = '';
                fields.forEach((f, i) => {
                    if (i) result = result + `, ${f} = ${checkData(prod[f])}`;
                    else result += `${f} = ${checkData(prod[f])}`;
                })
                return result;
            }
            function checkData(data) {
                if (typeof data === 'string') return `'${data}'`;
                else if ((typeof data === 'number') || (data === null)) return data;
                else {
                    console.error(`Wrong data: ${typeof data} ${data}`);
                    return null;
                }
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
