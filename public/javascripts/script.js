//const _baseURL = 'http://localhost:3001/';
const _baseURL = 'https://syncprom.herokuapp.com/';
const url = `${_baseURL}api`;
const socket = io(url);
const dateNow = new Date();
let syncExport = false;
let selectExport;
let online = false;
let sentStatus = false;
const version = '2.11.0';

socket
    .on('connect', () => {
        console.log(`Соединение установленно:${url} (${name})`);
    })
    .on('error', (error) => {
        console.error(error);
    })
    .on('disconnect', () => {
        changeOnlineStatus('danger');
    })
    .on('auth', () => {
        if (!token) modalAlert('У вас отстутствует token');
        else if (!name) modalAlert('У вас отсутствует название фирмы');
        else if (!option) modalAlert('У вас отсутствуют опции подключения к базе данных');
        else {
            socket.emit('auth', token, name, version, (err, info) => {
                if (err) return modalAlert(err); //выводим алерт окно
                console.log(info);
                online = changeOnlineStatus('success'); //все хорошо
                //установка свитча
                stateSwitch(info);
                //if (online) checkExport();//проверяем был ли запущен экспорт цен
                //setInterval(checkConnect, 60000);
            });
        }
    })
    .on('select', (sql, cb) => {
        const data = {opt: option, sql: sql};
        getData(data, (err, res) => {
            if (err) return console.error(err);
            else cb(res);
        });
    })
    .on('insert', (sql, cb) => {
        insertBD(option, sql).then(data => cb(data)).catch(err => cb({err: err}));
    })
    .on('blob', (sql, blob, cb) => {
        blobBD(option, sql, blob).then(data => cb(data));
    })
    .on('saveBlob', (sql, blob, data, cb) => {
        saveBlobBD(option, sql, blob, data).then(data => cb(data))
    })
    .on('progress', (status, title, total, step) => {
        progress(status, title, total, step);
    })
    .on('alert', (text) => {
        showAlert(text);
    })
    .on('console', (type, item) => console.log(type, item))
    .on('infoWindow', (msg, cb) => {
        //открываем окно с предложением сохранить товары
        openInfoWindow(msg)
            .then((res) => cb(res));
    })
    .on('selectOrders', (orders, cb) => {
        //выводим заказы в таблицу
        printOrders(orders)
            .then(res => cb(null, res))
            .catch(err => {
                console.log(err);
                cb(null, []);
            })
    })
    .on('selectTovar', (elems, cb) => {
        //выводим позиции в окно
        openSelTovarWindow(elems)
            .then(e => cb(null, e))
            .catch(err => cb(err, null))
    })
    .on('selectGroups', (groups, rootGroup, cb) => {
        //проверка на сохраненные товары в базе
        $('#modal-groups').modal('show');
        checkDB()
            .then(e => {
                console.log(e);
                if (e) {
                    //выводим группы в окно
                    return createTable8(groups, rootGroup);
                } else {
                    cb('Экспорт отменен', null);
                }
            })
            .then(e => {
                    $('#modal-groups').modal('hide');
                    cb(null, e.currentTarget.dataset.group);
                })
            .catch(err => cb(err, null));



        //выводим группы в таблицу
        // createTable8(groups, rootGroup)
        //
    })
    .on('csv', (file, name, type, msg, cb) => {
        console.log(file, name, type, msg);
        switch (type) {
            case 'prom':
                saveCsv(file, name, type).then(data => {
                    console.log(data);
                    cb(null, data)
                }).catch(err => cb(err, null));
                break;
            case 'random':
                //вызываем окно для ввода названия файл
                const date = new Date();
                openInfoWindow(`${msg} (имя файла будет: ${name + date.toDateString()})`)
                    .then(res => {
                        if (res) {
                            saveCsv(file, name + date.toDateString(), type)
                                .then(data => {
                                    console.log(data);
                                    cb(null, data)})
                                .catch(err => cb(err, null));
                        } else {
                            cb(null, {error: 'Сохранение файла отменено'});
                        }
                    })
                break;
            default: console.error('Неизвестный кейс: ' + type);
        }
    })
    .on('xlsx', (data, msg, filename, type, cb) => {
        //show the window for choice, save or not
        const date = new Date();
        openInfoWindow(`${msg} (имя файла будет: ${filename} ${date.toDateString()})`)
            .then(res => {
                console.log(data);
                if (res) {
                    //if save, send the data on save
                    saveXlsx(data, `${filename} ${date.toDateString()}`, type)
                        .then(r => cb(null, r))
                        .catch(err => cb(err, null));
                } else {
                    cb(null, 'Ok');
                }
            })
    });
function saveCsv(file, name, type) {
    return new Promise((res, rej) => {
        fetch('/csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: JSON.stringify({csv: file, name: name, type: type})})
            .then(r => r.json())
            .then(data => res(data))
            .catch(err => rej(err))
    })
}

function getData(data, cb) {
    fetch('/sql/select', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: JSON.stringify(data)})
        .then(res => res.json())
        .then(data => cb(null, data))
        .catch(err => cb(err, null))
}

function pushData(data, cb) {
    fetch('/sql/insert', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        },
        body: JSON.stringify(data)
    }).then((res) => {
        return res.json();
    }).then((data) => {
        if (data.status === 'ok') {
            cb(null);
        } else {
            cb(`Во время записи что то пошло не так: ${data}`);
        }
    }).catch((err) => cb(err));
}

function onImport(date, setting) {
    if (!date) {
        date = getTwoDate().split(' ');
    }
    socket.emit('import', date, setting, (err, result) => {
        if (err) {
            showAlert(`Что то пошло не так: Дата: ${date}`);
            return modalAlert(handlerError(err));
        }
        if (result === null || !result.length) showAlert(`Накладных нет`);
        else {
            showAlert(`Загруженно накладных: ${result.length} шт.`);
            //открывать окно для импорта писем за другой день
            openDateImport(result[result.length - 1].date_created.slice(0, 10));
        }
        console.log(result);
    });
}
//import data from Prom
function onImportData() {
    const byGroup = $('#modal-import-data').data('group');
    console.log(byGroup);
    const fields = [];
    const elems = $('.import-data-field.active');
    if (!elems.length) {
        showAlert('Не выбраны поля для импорта');
    }
    for (let i = 0; i < elems.length; i++) {
        fields.push(elems[i].dataset.field);
    }
    $('#modal-import-data').modal('hide');
    socket.emit('importData', byGroup, fields, (err, prods) => {
        console.log(err, prods);
    })
}
//add and remove active class
function switchActive(elem) {
    $(elem).hasClass('active') ? $(elem).removeClass('active') : $(elem).addClass('active');
}
//save data in .xlsx file
function saveXlsx(data, filename, type) {
    console.log(data);
    return new Promise((res, rej) => {
        fetch('/sql/xlsx', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=utf-8'
                },
                body: JSON.stringify({data: data, filename: filename, type: type})})
            .then(res => res.json())
            .then(body => res(body))
    })
}

function onExport(select) {
    syncExport = true;
    selectExport = select;
    $('#modal-export').modal('hide');
    socket.emit('export', Date.now(), select, (err, res) => {
        if (err) showAlert(err);
        else {
            showAlert('Экспорт окончен');
            syncExport = false;
            selectExport = '';
            console.log(err, res);
            //window.open(`${_baseURL}${res}`);
        }
        progress(false);
    })
}

function onExportNew() {
    // $('#modal-export').modal('hide');
    // socket.emit('test', Date.now(), (err, res) => {
    //     console.log(err, res)
    // })
    console.log('В разработке');
}

function onDateImport(setting) {
    const date = $('#modal-import input').val().split(' ');
    //const date1 = date.slice(0, 10);
    //const date2 = date.slice(11, 21);
    if (date !== '') {
        onImport(date, setting);
    }
    $('#modal-import').modal('hide');
}
//изменение цен
function onChangePrice(group) {
    //get additional field
    socket.emit('getAdditionalField', (fields) => {
        showAlert('Прайс сохранен');
        if (group) {
            //открываем окно выбора групп
            $('#modal-groups').modal('show');
            //отправляем запрос на получение всех групп
            const data = {opt: option, sql: `SELECT NUM, NAME, GRUPA FROM TIP`};
            getData(data, (err, groups) => {
                console.log(err, groups);
                //сортируем группы
                sortGroup(groups.data, 0)
                    .then(d => createTable7(d, 0))
                    .then(nums => {
                        //закрываем окно групп
                        $('#modal-groups').modal('hide');
                        return fetch('/sql/data', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json;charset=utf-8'
                            },
                            body: JSON.stringify({opt: option, data: nums, fields: fields, watch: false, filename: 'price'})
                        });
                    })//скачиваем полученную позицию(n.currentTarget.dataset.group)
                    .then(res => res.json())
                    .then(r => {
                        status();
                        showAlert(r.data);
                    })
                    .catch(err => console.log(err))
                //выводим группы в окно
            })
        } else {
            fetch('/sql/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=utf-8'
                },
                body: JSON.stringify({opt: option, data:null, watch: true, fields: fields, filename: 'price'})})
                .then(res => res.json())
                .then(r => {
                    //надо подписаться на изменения
                    status();
                    showAlert(r.data);
                    console.log(null, r.data)})
                .catch((err) => console.log(err, null));
        }
    })
}

function downloadTTN() {
    const date = $('#modal-ttn input.date').val();
    const socket2 = io('https://apxu-prom.herokuapp.com/chat');
    $('#modal-ttn').modal('hide');
    socket2.emit('find ttn', date.split(' '), (err, docs) => {
        socket2.disconnect();
        if (err) {
            console.error(err);
            return showAlert('ОШИБКА: Что то пошло не так');
        }
        if (docs && docs.length) {
            socket.emit('updateTTN', docs, (err, info) => {
                showAlert(`Загрузка ТТН закончена`);
            })
        } else {
            showAlert('В этой дате ТТН не найдены');
        }
    })
}

function openTTNWindow() {
    $('#modal-ttn').modal('show');
    $('#modal-ttn input.date').val(getTwoDate());
}
//получить две даты
function getTwoDate() {
    const date = dateNow.toJSON().slice(0,10);
    return `${date} ${date}`;
}

function openPrice() {
    $('#modal-price').modal('show');
    //получаем список групп
    getData({opt: option, sql: 'SELECT NUM, NAME FROM TIP'}, (err, data) => {
        //выводим в таблицу
        console.log(err, data);
        $('#modal-price .price-tip tbody').html(createTable5(data.data));
    })
}

function downloadPrice() {
    //ищем выбранную группу
    const elems = $('#modal-price tbody input[type=radio]:checked');
    if (!elems.length) console.log('Группа не выбрана');
    else {
        //скачиваем все позиции группы
        getData({opt: option, sql: `SELECT NUM, NAME, CENA_R, CENA_O FROM TOVAR_NAME WHERE TIP = ${elems[0].dataset.id} AND(DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL)`}, (err, data) => {
            //скрываем таблицу с группами
            $('#modal-price .price-tip').addClass('hidden');
            //показываем таблицу с товарами
            $('#modal-price .price-tovar').removeClass('hidden');
            //выводим в таблицу товары
            $('#modal-price .price-tovar tbody').html(createTable6(data.data));
            //устанавливаем обработчик кликов
            $('.price-change').on('click', (e) => {
                const elem = e.target;
                //открываем окно для изменения цены
                let newValue = prompt(elem.dataset.name, elem.innerText);
                if (newValue) {
                    //сохраняем изменения
                    insertBD(option, `UPDATE TOVAR_NAME SET ${elem.dataset.type} = ${newValue} WHERE NUM = ${elem.dataset.num}`)
                        .then(() => {
                            //обновление прошло успешно, красим в зеленый цвет
                            elem.innerText = newValue;
                            elem.style.color = 'green';
                        })
                        .catch(err => {
                            console.log(err);
                            //обновление прошло не успешно, красим в красный
                            elem.style.color = 'tomato';
                        })
                }
            })
        })
    }
}

function openDateImport(date) {
    const modalImport = $('#modal-import');
    modalImport.modal('show');
    modalImport.find('.apxu-import-alert').html(`Все заказы ${date} загружены`);
}

function openSettings() {
    $('#modal-settings').modal('show');
}

function openSync() {
    $('#modal-sync').modal('show');
    //отправляем запрос на сервер, получаем последние даты синхронизации и кол-во документов
    socket.emit('syncInfo', (err, data) => {
        $('#modal-sync tbody').html(createTable4(data));
    })
}

function openOrders() {
    $('#modal-settings').modal('hide');
    const modalOrders = $('#modal-orders');
    modalOrders.find('.modal-title').html(`Заказы: лист 1`);
    modalOrders.modal('show');
    modalOrders[0].dataset.page = 0;
    //загрузить данные
    getOrders(0, (err, orders) => {
        if (err) return modalAlert(err);
        console.log(orders);
        modalOrders.find('tbody').html(creatTable(orders));
    });
}

function goDown() {
    const modalOrders = $('#modal-orders');
    const page = modalOrders[0].dataset.page - 1;
    if (page >= 0) {
        getOrders(page, (err, orders) => {
            if (err) return modalAlert(err);
            modalOrders.find('.modal-title').html(`Заказы: лист ${page + 1}`);
            modalOrders.find('tbody').html(creatTable(orders));
            modalOrders[0].dataset.page = page;
        });
    }
}

function goUp() {
    const modalOrders = $('#modal-orders');
    const page = Number(modalOrders[0].dataset.page) + 1;
    getOrders(page, (err, orders) => {
        if (err) return modalAlert(err);
        modalOrders.find('.modal-title').html(`Заказы: лист ${page + 1}`);
        modalOrders.find('tbody').html(creatTable(orders));
        modalOrders[0].dataset.page = page;
    });
}

function onTrash(id, orderId) {
    socket.emit('removeOrder', id, (err, info) => {
        if (err) modalAlert(err);
        if (info.ok) {
            //удаляем запись с УКРсклад
            //по id находим запись в Укрсклад SCHET NUM
            deleteOrder(orderId)
                .then(d => {
                    //удаляем эту строку
                    $(`tbody tr[data-id=${id}]`).remove();
                    //проверяем если элементов больше нет
                    if (!$('tbody tr').length) {
                        //отправляем запрос на скачку нового листа заказов
                        const modalOrders = $('#modal-orders');
                        const page = Number(modalOrders[0].dataset.page);
                        getOrders(page, (err, orders) => {
                            if (err) return modalAlert(err);
                            modalOrders.find('.modal-title').html(`Заказы: лист ${page + 1}`);
                            modalOrders.find('tbody').html(creatTable(orders));
                        });
                    }
                })
                .catch(err => {
                    console.error({err: err, info: 'onTrash'});
                    showAlert(err);
                });
        }
    });
}

function deleteOrder(id) {
    return new Promise((res, rej) => {
        const sql = `SELECT NUM FROM SCHET WHERE NU = 'PROM-${id}'`;
        getData({opt: option, sql: sql}, (err, info) => {
            if (err) rej(err);
            if (!info.data.length) {
                rej(`Заказ с номером документа PROM-${id} не найден`);
            } else {
                const PID = info.data[0].NUM;
                console.log(PID);
                const sql = `DELETE FROM SCHET_ WHERE PID = ${PID}`;
                getDataPromise('/sql/insert', option, sql)
                    .then(d => {
                        const sql = `DELETE FROM SCHET WHERE NUM = ${PID}`;
                        return getDataPromise('/sql/insert', option, sql)
                    })
                    .then(d => res(d))
                    .catch(err => rej({err: err, info: 'deleteOrder()'}))
            }
        })
    })
}

function changeOnlineStatus(type) {
    const elem = $('.apxu-online-status');
    switch (type) {
        case 'success':
            elem.removeClass('badge-danger');
            elem.addClass('badge-success');
            elem.html('В сети');
            return true;
        case 'danger':
            elem.removeClass('badge-success');
            elem.addClass('badge-danger');
            elem.html('Нет сети');
            return false;
        default:
            console.error('Что то пошло не так', type);
            return false;
    }
}

function modalAlert(err) {
    const modalError = $('#modal-error');
    modalError.modal('show');
    $('#modal-error p.apxu-alert').html(err);
    modalError.on('hide.bs.modal', () => {
        $('#modal-error p.apxu-alert').html('');
        modalError.off('hide.bs.modal');
    });
}
//обработчик ошибок
function handlerError(err) {
    if (err.message) return err.message;
    else {
        console.error(err);
        return '';
    }
}

function getOrders(skip, cb) {
    socket.emit('getOrders', skip, (err, orders) => {
        cb(err, orders);
    });
}
//проверка запущен экспорт цен
function checkExport() {
    if (syncExport) onExport(selectExport)//запускаем експорт
}

function creatTable(orders) {
    let resault = '';
    const trash = `<svg class="bi bi-trash-fill" width="1em" height="1em" viewBox="0 0 16 16" 
                    fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" d="M2.5 1a1 1 0 00-1 1v1a1 1 0 001 
                    1H3v9a2 2 0 002 2h6a2 2 0 002-2V4h.5a1 1 0 001-1V2a1 1 0 00-1-1H10a1 
                    1 0 00-1-1H7a1 1 0 00-1 1H2.5zm3 4a.5.5 0 01.5.5v7a.5.5 0 01-1 0v-7a.5.5 
                    0 01.5-.5zM8 5a.5.5 0 01.5.5v7a.5.5 0 01-1 0v-7A.5.5 0 018 5zm3 .5a.5.5 0 
                    00-1 0v7a.5.5 0 001 0v-7z" clip-rule="evenodd"/>
                    </svg>`;
    orders.forEach((o, i)=> {
        resault += `<tr data-id="${o._id}">
          <th scope="row">${i + 1}</th>
          <td>${o.orderId}</td>
          <td>${o.name}</td>
          <td>${o.amount}</td>
          <td>${o.created}</td>
          <td>
            <button class="btn btn-outline-dark" onclick="onTrash('${o._id}', ${o.orderId})">${trash}</button></td>
          </tr>`;
    });
    return resault;
}
function createTable2(orders) {
    let resault = '';
    orders.forEach((o, i)=> {
        resault += `<tr data-id="${o.id}">
          <th scope="row">${i + 1}</th>
          <td>${o.id}</td>
          <td>${o.client_first_name} ${o.client_last_name}</td>
          <td>${o.price}</td>
          <td>${o.date_created}</td>
          <td>${o.status}</td>
          <td>
            <input type="checkbox" name="order" data-id="${o.id}">
          </td>
          </tr>`;
    });
    return resault;
}
function createTable3(elems) {
    let resault = '';
    elems.forEach((o, i)=> {
        resault += `<tr data-num="${o.NUM}">
              <td>
                <input type="radio" name="tovar" data-id="${i}">
              </td>
              <td>${o.NAME}</td>
              <td>${o.CENA}</td>
              <td>${o.CENA_OUT_CURR_ID}</td>
              <td>${o.CENA_O}</td>
              <td>${o.CENA_R}</td>
              <td>${o.DOPOLN1}</td>
              <td>${o.KOD}</td>
              <td>${o.IS_PRICE_INVISIBLE}</td>
          </tr>`;
    });
    return resault;
}
function createTable4(info) {
    const trash = `<svg class="bi bi-trash-fill" width="1em" height="1em" viewBox="0 0 16 16" 
                    fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" d="M2.5 1a1 1 0 00-1 1v1a1 1 0 001 
                    1H3v9a2 2 0 002 2h6a2 2 0 002-2V4h.5a1 1 0 001-1V2a1 1 0 00-1-1H10a1 
                    1 0 00-1-1H7a1 1 0 00-1 1H2.5zm3 4a.5.5 0 01.5.5v7a.5.5 0 01-1 0v-7a.5.5 
                    0 01.5-.5zM8 5a.5.5 0 01.5.5v7a.5.5 0 01-1 0v-7A.5.5 0 018 5zm3 .5a.5.5 0 
                    00-1 0v7a.5.5 0 001 0v-7z" clip-rule="evenodd"/>
                    </svg>`;
    return `
        <tr>
            <td>Данные с Пром</td>
            <td>${info.prom_sync}(UTC +0)</td>
            <td>${info.prom_q}</td>
            <td>
                <button class="btn btn-outline-dark" onclick="removeSync(this, 'prom')">${trash}</button>
            </td>
        </tr>
        <tr>
            <td>Данные с УкрСклад</td>
            <td>${info.ukr_sync}(UTC +0)</td>
            <td>${info.ukr_q}</td>
            <td>
                <button class="btn btn-outline-dark" onclick="removeSync(this, 'ukr')">${trash}</button>
            </td>
        </tr>`;
    
}
function createTable5(tips) {
    let resault = '';
    tips.forEach((o, i)=> {
        resault += `<tr data-num="${o.NUM}">
              <td>${i}</td>
              <td>${o.NAME}</td>
              <td>
                <input type="radio" name='tip' data-id="${o.NUM}">
              </td>
          </tr>`;
    });
    return resault;
}
function createTable6(tovar) {
    let resault = '';
    tovar.forEach((o, i)=> {
        resault += `<tr data-num="${o.NUM}">
              <td>${i}</td>
              <td>${o.NAME}</td>
              <td class="price-change" data-num="${o.NUM}" data-type="CENA_R" data-name="${o.NAME}">${o.CENA_R}</td>
              <td class="price-change" data-num="${o.NUM}" data-type="CENA_O" data-name="${o.NAME}">${o.CENA_O}</td>
          </tr>`;
    });
    return resault;
}
//таблица групп укр склад
function createTable7(groups, root) {
    //в группах создаем вложеность
    return new Promise((res, rej) => {
        $('#modal-groups .modal-body').html(`<button class="btn btn-sm btn-outline-dark send-group">Загрузить</button>
                                            <table class="table table-sm">
                                                <thead>
                                                    <tr>
                                                        <th scope="col">Название</th>
                                                        <th scope="col">Выбрать</th>
                                                    </tr>
                                                </thead>
                                                <tbody></tbody>
                                            </table>
                                            <button class="btn btn-sm btn-outline-dark send-group">Загрузить</button>`);
        const tableBody = $('#modal-groups tbody');
        const icon = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-check" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" d="M10.97 4.97a.75.75 0 0 1 1.071 1.05l-3.992 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.236.236 0 0 1 .02-.022z"/>
                  </svg>`;
        groups.forEach(g => {
            //если в группе родитель рут, добавляем в таблицу
            const elem = `<tr id="group-${g.NUM}" class="${(!g.LEVEL)?'':' hidden'}" data-level="${g.LEVEL}">
                                <td class="group-name" style="padding-left: ${g.LEVEL}rem">${g.NAME}<span class="open-group open-g">(+)</span></td>
                                <td>
                                    <button class="btn btn-sm btn-outline-dark check-group" data-group="${g.NUM}">${icon}</button>
                                </td>
                            </tr>`;
            if (g.GRUPA === root) {
                tableBody.append(elem);
            } else {
                //ищем родительскую группу и вставляем после нее группу
                const parent = $(`#group-${g.GRUPA}`);
                parent.after(elem);
            }
        });
        //открыть закрыть группы
        $('.open-group').on('click', (e) => {
            //берем родителя и проверяем кто следующий
            const parent = e.target.parentElement.parentElement;
            if ($(e.target).hasClass('open-g')) {
                $(e.target).removeClass('open-g').addClass('close-g').text('(-)');
                unHidden(parent);
            } else if ($(e.target).hasClass('close-g')) {
                $(e.target).removeClass('close-g').addClass('open-g').text('(+)');
                addHidden(parent, parent.dataset.level)
            } else console.error('Этот кейс не должен сработать');
        })
        //выбрать группу
        $('.check-group').on('click', (e) => {
            if ($(e.currentTarget).hasClass('active')) {
                $(e.currentTarget).removeClass('active');
            } else $(e.currentTarget).addClass('active');
        })
        $('.send-group').on('click', (e) => {
            const result = [];
            //собираем все кнопки
            const btns = $('.check-group.active').toArray();
            btns.forEach(b => result.push(b.dataset.group));
            res(result);
        });
        function unHidden(parent) {
            if (parent.nextSibling && $(parent.nextSibling).hasClass('hidden')) {
                $(parent.nextSibling).removeClass('hidden');
                unHidden(parent.nextSibling);
            }
        }
        function addHidden(parent, lvl) {
            if (parent.nextSibling && (parent.nextSibling.dataset.level > lvl)) {
                $(parent.nextSibling).addClass('hidden');
                addHidden(parent.nextSibling, lvl);
            }
        }
    })
}
//таблица групп
function createTable8(group, root) {
    return new Promise((res, rej) => {
        $('#modal-groups .modal-body').html(`<table class="table table-sm">
                                                <thead>
                                                    <tr>
                                                        <th scope="col">Название</th>
                                                        <th scope="col">Выбрать</th>
                                                    </tr>
                                                </thead>
                                                <tbody></tbody>
                                            </table>`);
        const tableBody = $('#modal-groups tbody');
        const icon = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-check" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" d="M10.97 4.97a.75.75 0 0 1 1.071 1.05l-3.992 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.236.236 0 0 1 .02-.022z"/>
                  </svg>`;
        group.groups.forEach(g => {
            //если в группе родитель рут, добавляем в таблицу
            const elem = `<tr id="group-${g.id}">
                                <td class="group-name" style="padding-left: ${group.ids[g.id].level}rem">${g.name}</td>
                                <td>
                                    <button class="btn btn-sm btn-outline-dark send-group" data-group="${g.id}">${icon}</button>
                                </td>
                            </tr>`;
            if (g.parent_group_id === root) {
                tableBody.append(elem);
            } else {
                //ищем родительскую группу и вставляем после нее группу
                const parent = $(`#group-${g.parent_group_id}`);
                parent.after(elem);
            }
        });
        $('.send-group').on('click', (e) => {
            res(e)
        })
    });
}

function progress(status, title, total, step) {
    if (status) {
        $('.progress').removeClass('hidden');
        const proc = 100/total*step;
        $('.progress-bar').attr({'aria-valuenow': proc, style: `width:${proc}%`}).html(`${title}:${total}/${step}`);
    } else {
        $('.progress').addClass('hidden');
    }
}
//запись в базу данных
function insertBD(opt, sql) {
    return new Promise((res, rej) => {
        getDataPromise('/sql/insert', opt, sql)
            .then(data => {
                if (data.status === "ok") {
                    res(data);
                } else {
                    console.log(data);
                    rej(new Error(`Во время записи что то пошло не так: ${data}`));
                }
            })
            .catch(err => rej(err));
    });
}
//выборка с базы блобов
function blobBD(opt, sql, blob) {
    return new Promise((res, rej) => {
        getDataPromise('/sql/blob', opt, sql, blob)
            .then(data => res(data))
            .catch(err => rej(err));
    })
}
//загрузка в базу блоб
function saveBlobBD(opt, data) {
    return new Promise((res, rej) => {
        fetch('/sql/saveBlob', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: JSON.stringify({opt: opt, data: data})
        })
            .then(r => r.json())
            .then(data => res(data))
            .catch(err => {
                console.error(err);
                rej(err)
            });
    })
}
//выборка с базы данных
function selectBD(opt, sql) {
    return new Promise((res, rej) => {
        getDataPromise('/sql/select', opt, sql)
            .then(data => res(data))
            .catch(err => rej(err));
    });
}
//стираем синхронизацию
function removeSync(e, data) {
    socket.emit('removeSync', data, (err, info) => {
        if (info.ok) {
            e.parentNode.parentNode.children[1].innerHTML = '1970-01-01T00:00:00.000Z(UTC +0)';
            e.parentNode.parentNode.children[2].innerHTML = 0;
        }
    })
}
//получить данные из файрбирд
function getDataPromise(url, option, sql, blob, data) {
    // const url = '/sql/select';
    // const sql = 'SELECT * FROM TIP';
    return new Promise((res, rej) => {
        if (!url) rej(new Error('URL отсутствует'));
        if (!option) rej(new Error('Отсудствуют опции для подключения к БД'));
        if (!sql) rej(new Error('SQL запрос отсутствует'));
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: JSON.stringify({opt: option, sql: sql, blob: blob, data: data})
            })
            .then(r => r.json())
            .then(data => res(data))
            .catch(err => {
                console.error(err);
                rej(err)
            });
    })
}
//открываем информационное окно
function openInfoWindow(info) {
    $('#modal-info').modal('show');
    $('.apxu-info-alert').html(info);
    return new Promise((res, rej) => {
        $('.apxu-yes').on('click', () => {
            res(true);
            $('#modal-info').modal('hide');
        });
        $('.apxu-no').on('click', () => {
            res(false);
            $('#modal-info').modal('hide');
        })
    })
}
//открываем окно выбора товара
function openSelTovarWindow(elems) {
    $('#modal-select-tovar').modal('show');
    $('#modal-select-tovar tbody').html(createTable3(elems));
    return new Promise((res, rej) => {
        $('.submit-tovar').on('click', () => {
            const elems = $('#modal-select-tovar tbody input[type=radio]:checked');
            if (!elems.length) rej('Товар не выбран');
            else res(+elems[0].dataset.id);
            $('#modal-select-tovar').modal('hide');
            $('.submit-tovar').off();
        });
        $('#modal-select-tovar').on('hidden.bs.modal', (e) => {
            rej('Окно закрыто');
        });
    })
}
//ищем нужный обьект
function serchElem(group, p) {
    console.log(group);
    if (group.length === 1) {
        return group[0].NUM;
    } else {
        //делим количество на два
        const index = Math.ceil(group.length/2);
        if (p.product.name.charAt(1) <= group[index].NAME.charAt(1)) {//m < z
            //если вторая буква меньше возв первую половину массива
            return serchElem(group.slice(0, index), p)
        } else {
            return serchElem(group.slice(index, group.length), p);
        }
    }
}
//открываем окно для выбора заказов
function printOrders(orders) {
    $('#modal-select-orders').modal('show');
    return new Promise((res, rej) => {
        $('#modal-select-orders').find('tbody').html(createTable2(orders));
        $('.submit-orders').on('click', (e) => {
            $('.submit-orders').off();
            //console.log(e);
            const checked = $('#modal-select-orders input:checked');
            const result = [];
            for (let i = 0; i < checked.length; i++) {
                orders.forEach(o => {
                    if (checked[i].dataset.id == o.id) {
                        result.push(o);
                    }
                })
            }
            $('#modal-select-orders').modal('hide');
            res(result);
        })
    })
}
//выделяем все заказы
function checkAll(e) {
    console.log(e);
    const boxes = $('#modal-select-orders input[name="order"]');
    for (let i = 0; i < boxes.length; i++) {
        boxes[i].checked = !!e.checked;
    }
}
//проверка подключения к укрсклад
function checkConnect(func) {
    return new Promise((res, rej) => {
        fetch('/sql/checkconnection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: JSON.stringify({opt: option})})
            .then(res => res.json())
            .then(data => {
                if (!data.connected) {
                    $('#modal-lost-connection').modal('show');
                } else {
                    $('#modal-lost-connection').modal('hide');
                    res(func);
                }
            })
            .catch(err => {
                console.log(err);
                //открываем окно с ошибкой
                $('#modal-lost-connection').modal('show');
            })
    })
}
//проверка есть ли в базе сохраненные товары
function checkDB() {
    return new Promise((res, rej) => {
        socket.emit('syncInfo', (err, data) => {
            console.log(err, data);
            if (data.prom_q && data.ukr_q) {
                //вывести окно, с предупреждением, что в баз есть данные с прошлого экспорта
                //если эти данные не с этого экспорта лучше их очистить что бы в таблицу
                //не попали товары с других групп
                //вывести две кнопки, продолжить или отмена
                $('#modal-groups .modal-body').html(`<p>Если вы видите это окно значит с прошлого экспорта в базе
                                                    остались данные, во избежания экспорта других товаров (товаров 
                                                    из других групп) рекомендуем очисть прошлую синхронизацию в 
                                                    Настройках</p>
                                                    <div class="btn-group" role="group">
                                                          <button type="button" class="btn btn-outline-dark" data-btn="1">Продолжить</button>
                                                          <button type="button" class="btn btn-outline-dark" data-btn="0">Отменить</button>
                                                    </div>`);
                $('#modal-groups .modal-body button').on('click', (e) => {
                    if (+e.currentTarget.dataset.btn) res(true);
                    else res(false);
                });
            } else {
                res(true);
            }
        })
    })
}
//подписываемся на сообщения о статусе
function status() {
    if (!sentStatus) {
        sentStatus = true;
        start();
        //let data = '';
        function start(data) {
            if (sentStatus) {
                console.log('status');
                const query = (data)?`?${data}`:'';
                fetch('/sql/status' + query, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json;charset=utf-8'
                    }})
                    .then(res => res.json())
                    .then(data => {
                        showAlert(data.info);
                        if (data.request === 'Сохранять изменения в УкрСклад?') {
                            openInfoWindow(data.request)
                                .then(bool => start(`saveFile=${bool}&removeRequest=true`))
                        }
                        else if(data.status) {
                            setTimeout(start, 1000);
                        } else {
                            showAlert('Слежение окончено');
                            sentStatus = false;
                        }
                    })
                    .catch(err => console.log(err))
            } else {
                showAlert('Слежение остановлено');
            }
        }
    } else {
        console.log('Проверка статуса уже включена, повтороно включить не получится');
    }
}
//остановить подписку на статус
function stopWatch() {
    sentStatus = false;
}
//вывод сообщения
function showAlert(html) {
    $('.alert').html(html).removeClass('hidden');
    console.log('alert', html);
    setTimeout(() => {$('.alert').addClass('hidden')}, 20000);
}
//сортировка групп
function sortGroup(groups, root) {
    return new Promise((res, rej) => {
        let result = [];
        let level = 0;
        start([{NUM: root}]);
        function start(roots) {
            const parentGroups = [];
            if (!roots.length) res(result);
            else {
                roots.forEach(r => {
                    groups.forEach(g => {
                        if (r.NUM === g.NUM) {
                            //не чего не делаем
                        } else if (r.NUM === g.GRUPA) {
                            g.LEVEL = level;
                            parentGroups.push(g);
                        }
                    })
                });
                result = [...result, ...parentGroups];
                level++;
                start(parentGroups);
            }
        }
    });
}
//поиск в базе неподдерживаемых символов
function calib() {
    //проверяем базу на неподдерживаемые символы
    //берем все товары SELECT NUM, NAME FROM TOVAR_NAME
    const result = [];
    const data = {opt: option, sql: `SELECT NUM, NAME, DOPOLN4 FROM TOVAR_NAME WHERE (DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL)`};
    getData(data, (err, tovar) => {
        console.log(tovar);
        if (tovar && tovar.data) {
            tovar.data.forEach(t => {
                if (t.NAME && (t.NAME.indexOf(`'`) !== -1)) {
                    result.push(t);
                }
            });
        } else {
            //данных нет, база пуста
            modalAlert('База пустая');
        }
        console.log(result);
        //поиск удаленных позиций
        getData({opt: option, sql: 'SELECT TOVAR_ID FROM TOVAR_ZAL'}, (err, zal) => {
            const zalObj = {};
            if (zal.data) {
                zal.data.forEach(z => zalObj[z.TOVAR_ID] = z.TOVAR_ID);//tovar[1,2,3,4,5] zal[2,3]
                const result2 = tovar.data.filter(t => {
                    if (!zalObj[t.NUM]) return t;
                });
                console.log(result2);
            } else {
                //данных нет, база пуста
                modalAlert('База пустая');
            }
        })
    })
}
//auto fix unsupported simbols
function calibAuto() {
    $('#modal-settings').modal('hide');
    const result = [];
    const data = {opt: option, sql: `SELECT NUM, NAME, DOPOLN4 FROM TOVAR_NAME WHERE (DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL)`};
    getData(data, (err, res) => {
        console.log(res);
        if (res.data) {
            res.data.forEach(t => {
                if (t.NAME && (t.NAME.indexOf(`'`) !== -1)) {
                    result.push(t);
                }
            });
        } else {
            //данных нет, база пуста
            modalAlert('База пустая');
        }
        console.log(result);
        //поиск удаленных позиций
        getData({opt: option, sql: 'SELECT TOVAR_ID FROM TOVAR_ZAL'}, (err, zal) => {
            const zalObj = {};
            let result2;
            if (zal.data) {
                zal.data.forEach(z => zalObj[z.TOVAR_ID] = z.TOVAR_ID);//tovar[1,2,3,4,5] zal[2,3]
                result2 = res.data.filter(t => {
                    if (!zalObj[t.NUM]) return t;
                });
                console.log(result2);
            } else {
                //данных нет, база пуста
                modalAlert('База пустая');
            }
            //update prods
            let i = 0;
            start();
            function start() {
                if (i === result.length) {
                    progress(false);
                    showAlert(`Исправление окончено, изменено ${result.length} названий`);
                    //запускаем вторую функцию
                    let i = 0;
                    start2();
                } else {
                    progress(true, 'Исправляю неподдерживаемые символы', result.length, i);
                    const sql = `UPDATE TOVAR_NAME SET NAME = '${result[i].NAME.replace(/'/g, `"`)}' WHERE NUM = ${result[i].NUM}`;
                    insertBD(option, sql)
                        .then(() => {
                            i++;
                            start();
                        })
                        .catch(err => console.log(err));
                }
            }
            function start2() {
                if (i === result2.length) {
                    progress(false);
                    showAlert(`Исправление окончено, изменено ${result2.length} позиций`);
                    //запускаем вторую функцию
                } else {
                    progress(true, 'Добавление в удаленные позиции статус DELETED', result2.length, i);
                    const sql = `UPDATE TOVAR_NAME SET DOPOLN4 = 'DELETED' WHERE NUM = ${result2[i].NUM}`;
                    insertBD(option, sql)
                        .then(() => {
                            i++;
                            start2();
                        })
                        .catch(err => console.log(err));
                }
            }
        })
    })
}
//загрузка фото
function downloadPhoto(byGroup) {
    //отправляем запрос на сервер, что бы получить список фото
    socket.emit('downloadPhoto', byGroup, (err, images) => {
        if (err) console.log(err);
        saveImages(images)
            .then(r => showAlert(r));
    })
}
//сохранение фото
function saveImages(images) {
    return new Promise((res, rej) => {
        let i = 0;
        start();
        function start() {
            if (i === images.length) {
                progress(false);
                res('Загрузка фото окончена');
            } else {
                const data = images[i];
                if (data.URL.indexOf('https://images.ua.prom.st/') !== -1) {
                    saveBlobBD(option, data)
                        .then((r) => {
                            progress(true, 'Загрузка изоброжений', images.length, i);
                            if (!r.ok) console.log(r);
                            i++;
                            start();
                        })
                } else {
                    console.log('Неверный URL изоброжения', data);
                    i++;
                    start();
                }
            }
        }
    })
}
//удалить фото без ID
function removePhotoWithoutId() {
    //получаем список товаров с id
    const sql = `SELECT NUM, DOPOLN5 FROM TOVAR_NAME WHERE (DOPOLN5 = '' OR DOPOLN5 is NULL)`;
    let prodsWithOutId, images;
    selectBD(option, sql)
        .then(prods => {
            prodsWithOutId = prods.data;
            //получаем список фото
            return selectBD(option, `SELECT NUM, TOVAR_ID FROM TOVAR_IMAGES`)})
        .then(tovarImages => {
            images = tovarImages.data;
            //сравниваем
            return compareImagesAndTovar(images, prodsWithOutId)})
        .then(imgForRemove => {
            console.log(imgForRemove);
            //удаляем фото позиций без ID
            return removePhoto(imgForRemove)})
        .then(() => console.log('Удаление изоброжений окончено'));
}
//сравнить tovar_images и tovar_name
function compareImagesAndTovar(images, tovar) {
    const result = [];
    const objImg = {};
    const objTov = {};
    images.forEach(i => objImg[i.TOVAR_ID] = i);
    tovar.forEach(t => objTov[t.NUM] = t);
    for (let k in objImg) {
        if (typeof objTov[k] !== 'undefined') {
            result.push(objImg[k]);
        }
    }
    return result;
}
//удалить фото
function removePhoto(arr) {
    return new Promise((res, rej) => {
        let i = 0;
        start();
        function start() {
            if (i === arr.length) {
                progress(false);
                showAlert('Удаление изоброжений окончено:' + arr.length);
                res();
            }
            else {
                const sql = `DELETE FROM TOVAR_IMAGES WHERE NUM = ${arr[i].NUM}`;
                insertBD(option, sql)
                    .then(() => {
                        progress(true, 'Удаление изображений', arr.length, i);
                        i++;
                        start()})
                    .catch(err => console.log(err));
            }
        }
    })
}
//save changes
function saveChanges() {
    showAlert('Сохраняю изменения');
    fetch('sql/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: JSON.stringify({opt: option})
            })
        .then(r => r.json())
        .then(res => {
            if (res.err) {
                showAlert(res.err);
            } else {
                showAlert(res.data);
            }
        })
}
//export file
// function exportFile() {
//     fetch('sql/export', {
//             method: 'GET'})
//         .then(r => r.json())
//         .then(xlsx => {
//             console.log(xlsx);
//         })
// }
function test2() {
    const result = [];
    const sql = `SELECT NUM, DOPOLN5, TIP, DOPOLN4 FROM TOVAR_NAME WHERE DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL AND NOT(DOPOLN5 IS NULL)`;
    selectBD(option, sql)
        .then(r => {
            console.log(r.data.length);
            const obj = {};
            r.data.forEach(d => {
                if (d.DOPOLN5) {
                    if (!obj[d.DOPOLN5]) obj[d.DOPOLN5] = d.NUM;
                    else {
                        result.push(d);
                    }
                }
            })
            console.log(result);
        })
    //saveBlobBD(option, 'test', 'test', 'test').then(data => cb(data));
    //тест
    // $('#modal-settings').modal('hide');
    // socket.emit('test', Date.now(), false, (err, info) => {
    //     console.log(err, info)
    // });
    //---тест сохранения позиций с ИД но не промовским---
    // const file = [
    //     {a: 1, b: 2, c: 3, d: 4, e: 5},
    //     {a: 1, b: 3, c: 3, d: 4, e: 5},
    //     {a: 1, b: 2, c: 4, d: 4, e: 5},
    //     {a: 1, b: 2, c: 3, d: 5, e: 5},
    //     {a: 1, b: 2, c: 3, d: 4, e: 6}
    // ];
    // const type = 'random';
    // const name = 1111;
    // switch (type) {
    //     case 'prom':
    //         saveCsv(file, name, type).then(data => {
    //             console.log(data);
    //             cb(null, data)
    //         }).catch(err => cb(err, null));
    //         break;
    //     case 'random':
    //         //вызываем окно для ввода названия файл
    //         const date = new Date();
    //         const newName = prompt('Введите имя фалйла для сохранения спорных позиций из УкрСклада', date.toDateString());
    //         if (newName) {
    //             saveCsv(file, newName, type).then(data => {
    //                 console.log(data);
    //                 cb(null, data)
    //             }).catch(err => cb(err, null));
    //         } else {
    //             cb(null, {error: 'Сохранение файла отменено'});
    //         }
    //         break;
    //     default: console.error('Неизвестный кейс: ' + type);
    // }
    //---конец теста---
}

//сохранение товара
function test3() {
    // socket.emit('test', (err, info) => {
    //     //const buff = decoding(info.data);
    //     console.log(err, info);
    // });
}
//установка свитча
function stateSwitch(info){
    if (info) $('#customSwitch1').prop('checked', true);
}

$('#modal-import').on('hidden.bs.modal', (e) => {
    $(e.target).find('.apxu-import-alert').html('');
    $(e.target).find('input').val('');
});
$('#modal-info').on('hidden.bs.modal', (e) => {
    $('.apxu-info-alert').html('');
    $('.apxu-yes').off();
    $('.apxu-no').off();
});
$('#modal-price').on('hidden.bs.modal', (e) => {
    $(e.target).find('.price-tip tbody').html('');
    $(e.target).find('.price-tovar tbody').html('');
    $(e.target).find('.price-tip').removeClass('hidden');
    $(e.target).find('.price-tovar').addClass('hidden');
});
$('#modal-import').on('shown.bs.modal', (e) => {
    $('#modal-import input').val(getTwoDate());
});
$('#modal-groups').on('hidden.bs.modal', (e) => {
    $('#modal-groups .modal-body').html('');
});
$('#customSwitch1').change((e) => {
    if (e.target.checked) {
        //поиск по ID включен
        //найти поле для поиска ID
        if (online) {
            socket.emit('getNameTableForId', (name) => {
                console.log(name);
                //проверить базу на наличие ID
                const sql = `SELECT COUNT(*) FROM TOVAR_NAME WHERE NOT(${name} = '' OR ${name} is NULL)`;
                selectBD(option, sql)
                    .then(prodsWithId => {
                        console.log(prodsWithId.data[0].COUNT);
                        if (!prodsWithId.data[0].COUNT) {
                            $('#customSwitch1').prop('checked', false);
                            alert('Этот режим недоступен, у вас нет товаров с ID');
                        }
                        else {
                            //записываем значение переключателя в БД
                            socket.emit('updateSearchId', true, (err, info) => {
                                console.log(err, info);
                            });
                            const sql = `SELECT COUNT(*) FROM TOVAR_NAME`;
                            selectBD(option, sql)
                                .then(allProds => {
                                    alert(`У вас ${prodsWithId.data[0].COUNT} товаров с ID из ${allProds.data[0].COUNT}.`);
                                });
                        }
                    });

            });
        }
    } else {
        socket.emit('updateSearchId', false, (err, info) => {
            console.log(err, info);
        });
    }
})
$('#modal-select-orders').on('hidden.bs.modal', (e) => {
    progress(false);
})