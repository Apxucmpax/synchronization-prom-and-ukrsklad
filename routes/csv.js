const express = require('express');
const router = express.Router();
const createCsvWriter = require('csv-writer').createObjectCsvWriter;


router
    .post('/', (req, res) => {
        const {csv, name, type} = req.body;
        switch (type) {
            case 'prom':
                createCSV(csv, name)
                    .then(() => res.json({fileName: `${name}.csv`}));
                break;
            case 'random':
                randomCSV(csv, name)
                    .then(() => res.json({fileName: `${name}.csv`}));
                break;
            default:
                res.json({error: `Низвестный тип: ${type}`});
        }

    });
module.exports = router;
//создаем csv файл для загрузки на сервер
function createCSV(arr, name) {
    return new Promise((res, rej) => {
        //создаем CSV файл
        const csvWriter = createCsvWriter({
            path: `public/csv/${name}.csv`,
            header: [
                {id: 'sku', title: 'Код_товара'},
                {id: 'name', title: 'Название_позиции'},
                {id: 'type', title: 'Тип_товара'},
                {id: 'price', title: 'Цена'},
                {id: 'currency', title: 'Валюта'},
                {id: 'unit', title: 'Единица_измерения'},
                {id: 'prices', title: 'Оптовая_цена'},
                {id: 'min_quant', title: 'Минимальный_заказ_опт'},
                {id: 'presence', title: 'Наличие'},
                {id: 'id', title: 'Уникальный_идентификатор'},
                {id: 'group', title: 'Идентификатор_группы'},
                {id: 'external_id', title: 'Идентификатор_товара'},
                {id: 'keywords', title: 'HTML_ключевые_слова'}
            ]
        });
        csvWriter.writeRecords(arr)
            .then(() => res())
            .catch(err => {
                console.log('createCSV', err);
                rej(err)
            })
    })
}
//случайный csv файл
function randomCSV(arr, name) {
    return new Promise((res, rej) => {
        if (!arr.length) rej('Массив пуст');
        //создаем CSV файл
        const csvWriter = createCsvWriter({
            path: `public/csv/${name}.csv`,
            header: createHeader(arr[0])
        });
        csvWriter.writeRecords(arr)
            .then(() => res())
            .catch(err => {
                console.log('createCSV', err);
                rej(err)
            })
        function createHeader(item) {
            const result = []
            for (let k in item) {
                result.push({id: k, title: k})
            }
            return result;
        }
    })
}