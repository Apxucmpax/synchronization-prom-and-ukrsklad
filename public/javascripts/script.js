const _baseURL = ["https://syncprom1.herokuapp.com/", "https://syncprom.herokuapp.com/", "http://localhost:3001/"];
let socket = null;
const dateNow = new Date();
let syncExport = false;
let selectExport;
let online = false;
let sentStatus = false;
// flag open modal groups
let isOpenModalGroups = false;
const version = "2.30.0";
/** instanceService is now Service
 * @member {Service} instanceService
 */
const instanceService = new Service(dbOptions);

function testFetch(i, timeout) {
  let error = false;
  try {
    fetch(`${_baseURL[i]}ping`, {
      method: "GET",
      origin: "_baseURL[i]",
    })
      .then((res) => {
        if (res.status > 199 && res.status < 300) {
          start(`${_baseURL[i]}api`);
        } else
          setTimeout(() => {
            let index = 0;
            if (_baseURL.length !== i + 1) index = i + 1;
            testFetch(index, timeout * 2);
          }, timeout);
      })
      .catch((err) => {
        console.log(" err: ", err);
        setTimeout(() => {
          let index = 0;
          if (_baseURL.length !== i + 1) index = i + 1;
          testFetch(index, timeout * 2);
        }, timeout);
      });
  } catch (err) {
    error = true;
  } finally {
    if (error)
      setTimeout(() => {
        let index = 0;
        if (_baseURL.length !== i + 1) index = i + 1;
        testFetch(index, timeout * 2);
      }, timeout);
  }
}

//testFetch(0, 1000);
//start("http://localhost:3005");
start("https://sync.apxu.pp.ua");
function start(url) {
  socket = io(`${url}/api`);

  socket
    .on("connect", () => {
      console.log(`Соединение установленно:${url} (${name})`);
    })
    .on("error", (error) => {
      console.error("error", error);
    })
    .on("disconnect", () => {
      changeOnlineStatus("danger");
    })
    .on("auth", () => {
      if (!token) modalAlert("У вас отстутствует token");
      else if (!name) modalAlert("У вас отсутствует название фирмы");
      else if (!option) modalAlert("У вас отсутствуют опции подключения к базе данных");
      else {
        socket.emit("auth", token, name, version, (err, info, modules) => {
          if (err) return modalAlert(err); //выводим алерт окно
          console.log(info);
          if (modules) showModules(modules);
          online = changeOnlineStatus("success"); //все хорошо
          //установка свитча
          stateSwitch(info);
          //if (online) checkExport();//проверяем был ли запущен экспорт цен
          //setInterval(checkConnect, 60000);
          calib();
          //проверка на дубликаты
          checkDouble();
        });
      }
    })
    .on("select", (sql, cb) => {
      const data = { opt: option, sql: sql };
      getData(data, (err, res) => {
        if (err) return console.error(err);
        else cb(res);
      });
    })
    .on("insert", (sql, cb) => {
      insertBD(option, sql)
        .then((data) => cb(data))
        .catch((err) => cb({ err: err }));
    })
    .on("blob", (sql, blob, cb) => {
      blobBD(option, sql, blob).then((data) => cb(data));
    })
    .on("saveBlob", (sql, blob, data, cb) => {
      saveBlobBD(option, sql, blob, data).then((data) => cb(data));
    })
    .on("progress", (status, title, total, step) => {
      progress(status, title, total, step);
    })
    .on("alert", (text) => {
      showAlert(text);
    })
    .on("console", (type, item) => console.log(type, item))
    .on("infoWindow", (msg, cb) => {
      //открываем окно с предложением сохранить товары
      openInfoWindow(msg).then((res) => cb(res.status));
    })
    .on("selectOrders", (orders, cb) => {
      //выводим заказы в таблицу
      printOrders(orders)
        .then((res) => cb(null, res))
        .catch((err) => {
          console.log(err);
          cb(null, []);
        });
    })
    .on("selectTovar", (elems, cb) => {
      //выводим позиции в окно
      openSelTovarWindow(elems)
        .then((e) => cb(null, e))
        .catch((err) => cb(err, null));
    })
    .on("selectGroups", (groups, rootGroup, cb) => {
      //проверка на сохраненные товары в базе
      $("#modal-groups").modal("show");
      checkDB()
        .then((e) => {
          console.log(e);
          if (e) {
            //выводим группы в окно
            return createTable8(groups, rootGroup);
          } else {
            cb("Экспорт отменен", null);
          }
        })
        .then((e) => {
          $("#modal-groups").modal("hide");
          cb(null, e.currentTarget.dataset.group);
        })
        .catch((err) => cb(err, null));

      //выводим группы в таблицу
      // createTable8(groups, rootGroup)
      //
    })
    .on("csv", (file, name, type, msg, cb) => {
      console.log(file, name, type, msg);
      switch (type) {
        case "prom":
          saveCsv(file, name, type)
            .then((data) => {
              console.log(data);
              cb(null, data);
            })
            .catch((err) => cb(err, null));
          break;
        case "random":
          //вызываем окно для ввода названия файл
          const date = new Date();
          openInfoWindow(`${msg} (имя файла будет "${name} ${date.toString().slice(4, 24).replace(/:/g, "-")}")`).then((res) => {
            if (res.status) {
              saveCsv(file, `${name} ${date.toString().slice(4, 24).replace(/:/g, "-")}`, type)
                .then((data) => {
                  console.log(data);
                  cb(null, data);
                })
                .catch((err) => cb(err, null));
            } else {
              cb(null, { error: "Сохранение файла отменено" });
            }
          });
          break;
        default:
          console.error("Неизвестный кейс: " + type);
      }
    })
    .on("xlsx", (data, msg, filename, type, cb) => {
      console.log(" xlsx: ");
      //show the window for choice, save or not
      const date = new Date();
      const autoSave = typeof autoSaveXlsx !== "undefined" ? autoSaveXlsx : false;
      openInfoWindow(
        `${msg} (имя файла будет "${filename} ${date.toString().slice(4, 24).replace(/:/g, "-")}" или введите свое имя)`,
        true,
        autoSave
      ).then((res) => {
        console.log(data);
        if (res.status) {
          //if save, send the data on save and set the name of file time of creation
          saveXlsx(data, `${res.value || `${filename} ${date.toString().slice(4, 24).replace(/:/g, "-")}`}`, type)
            .then((r) => cb(null, r))
            .catch((err) => cb(err, null));
        } else {
          cb(null, "Ok");
        }
      });
    })
    .on("reloadOrder", (idOrder, idShop) => {
      console.log("deleteOrder", idOrder, idShop);
      deleteOrder(idOrder)
        .then((d) => {
          console.log(null, d);
          //удаляем заказ с бд
          socket.emit("removeOrder", "order", idOrder, (err, info) => {
            if (info.ok) {
              //отправляем на запись заказ
              socket.emit("modules", "downloadOrder", idOrder, idShop, (err, info) => {
                console.log(err, info);
                showAlert(`Загруженно накладных: ${info.length} шт.`);
              });
            }
          });
        })
        .catch((err) => {
          console.log(err, null);
          if (err["status"] && err["status"] === "not found") {
            //отправляем на запись заказ
            socket.emit("modules", "downloadOrder", idOrder, idShop, (err, info) => {
              console.log(err, info);
              showAlert(`Загруженно накладных: ${info.length} шт.`);
            });
          } else {
            showAlert(err);
          }
        });
    })
    .on("reloadOrders", reloadOrders)
    .on("createInvoice", (orders, idShop) => {
      socket.emit("modules", "createInvoiceByOrderId", orders, idShop, (err, info) => {
        if (err) return socket.emit("dwn error", err);
        socket.emit("dwn complete", "Общая накладная создана");
      });
    });
}

function saveCsv(file, name, type) {
  return new Promise((res, rej) => {
    fetch("/csv", {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
      },
      body: JSON.stringify({ csv: file, name: name, type: type }),
    })
      .then((r) => r.json())
      .then((data) => res(data))
      .catch((err) => rej(err));
  });
}

/** function getData get data from DB
 *
 * @name getData
 *
 * @param data ({opt: option, sql: 'string'})
 * @param cb (callback: 'function')
 *
 * @callback Error (Error)
 * @callback data (data: 'object')
 */
function getData(data, cb) {
  fetch("/sql/select", {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify(data),
  })
    .then((res) => res.json())
    .then((data) => cb(null, data))
    .catch((err) => cb(err, null));
}

function pushData(data, cb) {
  fetch("/sql/insert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify(data),
  })
    .then((res) => {
      return res.json();
    })
    .then((data) => {
      if (data.status === "ok") {
        cb(null);
      } else {
        cb(`Во время записи что то пошло не так: ${data}`);
      }
    })
    .catch((err) => cb(err));
}

function onImport(date, setting, e) {
  $(e).attr("disabled", true);
  if (!date) {
    date = getTwoDate().split(" ");
  }
  socket.emit("import", date, setting, (err, result) => {
    if (err) {
      showAlert(`Что то пошло не так: Дата: ${date}`);
      return modalAlert(handlerError(err));
    }
    if (result === null || !result.length) showAlert(`Накладных нет`);
    else {
      showAlert(`Загруженно накладных: ${result.length} шт.`);
      //открывать окно для импорта писем за другой день
      //openDateImport(result[result.length - 1].date_created.slice(0, 10));
    }
    $(e).attr("disabled", false);
    console.log(result);
  });
}

//import orders second shop
function ssOnImport(date, setting, e) {
  $(e).attr("disabled", true);
  //close window
  $("#modal-settings").modal("hide");
  if (!date) {
    date = getTwoDate().split(" ");
  }
  socket.emit("modules", "importSS", date, setting, (err, result) => {
    console.log(result);
    if (err) {
      showAlert(`Что то пошло не так: Дата: ${date}`);
      return modalAlert(handlerError(err));
    }
    if (result === null || !result.length) showAlert(`Накладных нет`);
    else {
      showAlert(`Загруженно накладных: ${result.length} шт.`);
    }
    $(e).attr("disabled", false);
    console.log(result);
  });
}

//import data from Prom
function onImportData() {
  const byGroup = $("#modal-import-data").data("group");
  console.log(byGroup);
  const fields = [];
  const elems = $(".import-data-field.active");
  if (!elems.length) {
    showAlert("Не выбраны поля для импорта");
  }
  for (let i = 0; i < elems.length; i++) {
    fields.push(elems[i].dataset.field);
  }
  $("#modal-import-data").modal("hide");
  socket.emit("importData", byGroup, fields, (err, prods) => {
    console.log(err, prods);
  });
}

//add and remove active class
function switchActive(elem) {
  $(elem).hasClass("active") ? $(elem).removeClass("active") : $(elem).addClass("active");
}

//save data in .xlsx file
function saveXlsx(data, filename, type) {
  return new Promise((res, rej) => {
    fetch("/sql/xlsx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
      },
      body: JSON.stringify({ data, filename, type }),
    })
      .then((res) => res.json())
      .then((body) => res(body));
  });
}

function onExport(select, e) {
  $(e).attr("disabled", true);
  syncExport = true;
  selectExport = select;
  $("#modal-export").modal("hide");
  socket.emit("export", Date.now(), select, (err, res) => {
    if (err) showAlert(err);
    else {
      showAlert("Экспорт окончен");
      syncExport = false;
      selectExport = "";
      console.log(err, res);
      //window.open(`${_baseURL}${res}`);
    }
    progress(false);
    $(e).attr("disabled", false);
  });
}

/** export the price product to prom.ua
 * @name ssOnExport
 *
 * @param {boolean} select - select groups for export
 * @param {Event} e - event click
 *
 * */
function ssOnExport(select, e) {
  //close modal-settings
  $("#modal-settings").modal("hide");
  $(e).attr("disabled", true);
  // syncExport = true;
  // selectExport = select;
  socket.emit("modules", "exportSS", Date.now(), select, (err, res) => {
    console.log(` ssOnExport: `, err, res);
  });
}

function onDateImport(setting) {
  const date = $("#modal-import input").val().split(" ");
  const data = $("#modal-import")[0].dataset;
  if (date !== "" && data.type) {
    if (data.type === "ss") ssOnImport(date, setting);
    else if (data.type === "classic") onImport(date, setting);
    else console.error("Что то пошло не так", data.type);
  }
  $("#modal-import").modal("hide");
}

//изменение цен
function onChangePrice(group, e) {
  $(e).attr("disabled", true);
  openInfoWindow("Вы уверены что хотите создать новый файл price.xlsx? Все предыдущие изменения в этом файле будут утеряны.").then(
    (res) => {
      if (res.status) {
        //get additional field
        socket.emit("getAdditionalField", "array", (fields) => {
          if (group) {
            //открываем окно выбора групп
            $("#modal-groups").modal("show");
            //отправляем запрос на получение всех групп
            const data = { opt: option, sql: `SELECT NUM, NAME, GRUPA FROM TIP` };
            getData(data, (err, groups) => {
              console.log(err, groups);
              //сортируем группы
              sortGroup(groups.data, 0)
                .then((d) => {
                  return instanceService.getConfigGroups().then((configGroups) => hideGroups(d, configGroups));
                })
                .then((d) => createTable7(d, 0))
                .then((d) => {
                  if (d.type === "group") return addNestingGroupsAsync(d);
                  return d;
                })
                .then((d) => {
                  console.log(` groups: `, d);
                  //закрываем окно групп
                  $("#modal-groups").modal("hide");
                  return fetch("/sql/data", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json;charset=utf-8",
                    },
                    body: JSON.stringify({ opt: option, data: d, fields: fields, watch: false, filename: "price" }),
                  });
                }) //скачиваем полученную позицию(n.currentTarget.dataset.group)
                .then((res) => res.json())
                .then((r) => {
                  status();
                  showAlert(r.data);
                  $(e).attr("disabled", false);
                })
                .catch((err) => console.log(err));
              //выводим группы в окно
            });
          } else {
            fetch("/sql/data", {
              method: "POST",
              headers: {
                "Content-Type": "application/json;charset=utf-8",
              },
              body: JSON.stringify({ opt: option, data: null, watch: true, fields: fields, filename: "price" }),
            })
              .then((res) => res.json())
              .then((r) => {
                //надо подписаться на изменения
                status();
                showAlert(r.data);
                console.log(null, r.data);
                $(e).attr("disabled", false);
              })
              .catch((err) => console.log(err, null));
          }
        });
      } else {
        $(e).attr("disabled", false);
      }
    }
  );
}

/** function getNestingGroupsAsync get nesting groups
 * @async
 * @name getNestingGroupsAsync
 *
 * @param {Array} paramArrayGroupsId - array groupId
 *
 * @return {Promise<Array>} update paramArrayGroupsId
 */
function getNestingGroupsAsync(paramArrayGroupsId) {
  return new Promise((res, rej) => {
    let i = 0;
    start();

    function start() {
      if (paramArrayGroupsId.length === i) return res(paramArrayGroupsId);
      instanceService.getNestedGroups(paramArrayGroupsId[i], (arrGroups) => {
        arrGroups.forEach((groupId) => paramArrayGroupsId.push(groupId.toString()));
        i++;
        start();
      });
    }
  });
}

/** function addNestingGroupsAsync update paramObj
 * @async
 * @name addNestingGroupsAsync
 *
 * @param {Object} paramObj ({type: 'string', value: ['number']})
 *
 * @return {Promise<Object>} paramObj ({type: 'string', value: ['number']})
 */
function addNestingGroupsAsync(paramObj) {
  return Promise.resolve(getNestingGroupsAsync(paramObj.value)).then((value) => {
    paramObj.value = value;
    return paramObj;
  });
}

function hideGroups(groups, configGroups) {
  return new Promise((res, rej) => {
    const updateGroups = groups.map((g) => {
      if (configGroups.data[g.NUM]) {
        g.hide = true;
        return g;
      } else {
        g.hide = false;
        return g;
      }
    });
    console.log(` newGroups: `, updateGroups);
    res(updateGroups);
  });
}

function downloadTTN(e) {
  $(e).attr("disabled", true);
  const date = $("#modal-ttn input.date").val();
  const socket2 = io("https://smsprom.apxu.pp.ua/chat");
  $("#modal-ttn").modal("hide");
  socket2.emit("find ttn", date.split(" "), (err, docs) => {
    socket2.disconnect();
    if (err) {
      console.error(err);
      return showAlert("ОШИБКА: Что то пошло не так");
    }
    if (docs && docs.length) {
      socket.emit("updateTTN", docs, (err, info) => {
        showAlert(`Загрузка ТТН закончена`);
        $(e).attr("disabled", false);
      });
    } else {
      showAlert("В этой дате ТТН не найдены");
      $(e).attr("disabled", false);
    }
  });
}

function openTTNWindow() {
  $("#modal-ttn").modal("show");
  $("#modal-ttn input.date").val(getTwoDate());
}

//получить две даты
function getTwoDate() {
  const date = dateNow.toJSON().slice(0, 10);
  const yesterday = new Date(dateNow - 1000 * 60 * 60 * 24).toJSON().slice(0, 10);
  return `${yesterday} ${date}`;
}

function openPrice() {
  $("#modal-price").modal("show");
  //получаем список групп
  getData({ opt: option, sql: "SELECT NUM, NAME FROM TIP" }, (err, data) => {
    //выводим в таблицу
    console.log(err, data);
    $("#modal-price .price-tip tbody").html(createTable5(data.data));
  });
}

function downloadPrice() {
  //ищем выбранную группу
  const elems = $("#modal-price tbody input[type=radio]:checked");
  if (!elems.length) console.log("Группа не выбрана");
  else {
    //скачиваем все позиции группы
    getData(
      {
        opt: option,
        sql: `SELECT NUM, NAME, CENA_R, CENA_O FROM TOVAR_NAME WHERE TIP = ${elems[0].dataset.id} AND(DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL)`,
      },
      (err, data) => {
        //скрываем таблицу с группами
        $("#modal-price .price-tip").addClass("hidden");
        //показываем таблицу с товарами
        $("#modal-price .price-tovar").removeClass("hidden");
        //выводим в таблицу товары
        $("#modal-price .price-tovar tbody").html(createTable6(data.data));
        //устанавливаем обработчик кликов
        $(".price-change").on("click", (e) => {
          const elem = e.target;
          //открываем окно для изменения цены
          let newValue = prompt(elem.dataset.name, elem.innerText);
          if (newValue) {
            //сохраняем изменения
            insertBD(option, `UPDATE TOVAR_NAME SET ${elem.dataset.type} = ${newValue} WHERE NUM = ${elem.dataset.num}`)
              .then(() => {
                //обновление прошло успешно, красим в зеленый цвет
                elem.innerText = newValue;
                elem.style.color = "green";
              })
              .catch((err) => {
                console.log(err);
                //обновление прошло не успешно, красим в красный
                elem.style.color = "tomato";
              });
          }
        });
      }
    );
  }
}

function openDateImport(date) {
  const modalImport = $("#modal-import");
  modalImport.modal("show");
  modalImport.find(".apxu-import-alert").html(`Все заказы ${date} загружены`);
}

function openSettings() {
  $("#modal-settings").modal("show");
}

function openSync() {
  $("#modal-sync").modal("show");
  //отправляем запрос на сервер, получаем последние даты синхронизации и кол-во документов
  socket.emit("syncInfo", (err, data) => {
    $("#modal-sync tbody").html(createTable4(data));
  });
}

function openOrders() {
  $("#modal-settings").modal("hide");
  const modalOrders = $("#modal-orders");
  modalOrders.find(".modal-title").html(`Заказы: лист 1`);
  modalOrders.modal("show");
  modalOrders[0].dataset.page = 0;
  //загрузить данные
  getOrders(0, (err, orders) => {
    if (err) return modalAlert(err);
    console.log(orders);
    modalOrders.find("tbody").html(creatTable(orders));
  });
}

function goDown() {
  const modalOrders = $("#modal-orders");
  const page = modalOrders[0].dataset.page - 1;
  if (page >= 0) {
    getOrders(page, (err, orders) => {
      if (err) return modalAlert(err);
      modalOrders.find(".modal-title").html(`Заказы: лист ${page + 1}`);
      modalOrders.find("tbody").html(creatTable(orders));
      modalOrders[0].dataset.page = page;
    });
  }
}

function goUp() {
  const modalOrders = $("#modal-orders");
  const page = Number(modalOrders[0].dataset.page) + 1;
  getOrders(page, (err, orders) => {
    if (err) return modalAlert(err);
    modalOrders.find(".modal-title").html(`Заказы: лист ${page + 1}`);
    modalOrders.find("tbody").html(creatTable(orders));
    modalOrders[0].dataset.page = page;
  });
}

function onTrash(id, orderId) {
  //удаляем запись с УКРсклад
  //по id находим запись в Укрсклад SCHET NUM
  deleteOrder(orderId)
    .then((d) => {
      socket.emit("removeOrder", "id", id, (err, info) => {
        if (err) modalAlert(err);
        //удаляем эту строку
        $(`tbody tr[data-id=${id}]`).remove();
        //проверяем если элементов больше нет
        if (!$("tbody tr").length) {
          //отправляем запрос на скачку нового листа заказов
          const modalOrders = $("#modal-orders");
          const page = Number(modalOrders[0].dataset.page);
          getOrders(page, (err, orders) => {
            if (err) return modalAlert(err);
            modalOrders.find(".modal-title").html(`Заказы: лист ${page + 1}`);
            modalOrders.find("tbody").html(creatTable(orders));
          });
        }
      });
    })
    .catch((err) => {
      console.log({ err: err, info: "onTrash" });
      showAlert(JSON.stringify(err));
    });
}
async function reloadOrders(idOrders, idShop) {
  try {
    socket.emit("dwn progress", "Поиск для удаление заказов с УкрСклад...");
    const schets = await getSchetByOrderIds(idOrders);
    //check schets have IS_RESERV
    const schetsWithReserv = schets.filter(({ IS_REZERV }) => !!IS_REZERV);
    if (schetsWithReserv.length) {
      return socket.emit(
        "dwn error",
        schetsWithReserv.map((s) => `Заказ зарезервирован: ${s.NU.slice(5)}`)
      );
    }
    //remove orders from UkrSklad
    socket.emit("dwn progress", "Удаление заказов с УкрСклад...");
    if (schets.length) {
      const success = await removeSchetsUkrSklad(schets.map(({ NUM }) => NUM));
      if (!success) return socket.emit("dwn error", "Ошибка удаления заказов с УкрСклад");
    }
    //remove orders from DB
    socket.emit("dwn progress", "Удаление заказов с Базы Данных...");
    await Promise.all(idOrders.map((id) => removeOrderDB(id)));
    //create orders in UkrSklad
    socket.emit("dwn progress", "Создание заказов в УкрСклад...");
    await downloadOrdersUkrSklad(idOrders, idShop, (max, current) => socket.emit("dwn progress", `Создан ${current} из ${max} заказов`));
    socket.emit("dwn complete", "Заказы успешно обновлены");
  } catch (err) {
    socket.emit("dwn error", err);
  }
}

/**
 * @typedef {{nameFn: String, body: any}} ErrorPromise
 */
/** get SCHETs by orderIds
 * @name getSchetByOrderIds
 *
 * @param {[String]} orderIds
 * @returns {Promise<[{NUM: Number, IS_RESERV: Number, NU: String}]|ErrorPromise>}
 */
function getSchetByOrderIds(orderIds) {
  return new Promise((resolve, reject) => {
    const result = [];
    // search order in UkrSklad
    const sql = `SELECT NUM, IS_REZERV, NU FROM SCHET WHERE NU IN (${orderIds.map((id) => `'PROM-${id}'`).join(",")})`;
    getData({ opt: option, sql }, (err, { data = [] }) => {
      if (err) return reject({ nameFn: "getSchetByOrderIds", body: err });
      resolve(data);
    });
  });
}

/** remove schets_ and schets from UkrSklad by NUM
 * @name removeSchetsUkrSklad
 * @param {[Number]} nums
 * @returns {Promise<Boolean|ErrorPromise>}
 */
function removeSchetsUkrSklad(nums) {
  return new Promise((resolve, reject) => {
    //validation
    if (!Array.isArray(nums) || !nums.length) {
      return reject({ nameFn: "removeSchetsUkrSklad", body: "Schould be array of numbers" });
    }
    const notNumber = nums.filter((num) => typeof num !== "number");
    if (notNumber.length) {
      return reject({ nameFn: "removeSchetsUkrSklad", body: "Schould be array of numbers" });
    }
    const sql = `DELETE FROM SCHET_ WHERE PID IN (${nums.join()})`;
    getDataPromise("/sql/insert", option, sql)
      .then(() => {
        const sql = `DELETE FROM SCHET WHERE NUM IN (${nums.join()})`;
        return getDataPromise("/sql/insert", option, sql);
      })
      .then(() => {
        resolve(true);
      })
      .catch((err) => {
        reject({ nameFn: "removeSchetsUkrSklad", body: err });
      });
  });
}

/** remove order from db
 * @name removeOrderDB
 * @param {String} orderId
 * @returns {Promise<unknown>}
 */
function removeOrderDB(orderId) {
  return new Promise((res, rej) => {
    if (typeof orderId !== "string") {
      return rej({ nameFn: "removeOrderDB", body: "Schould be string" });
    }
    socket.emit("removeOrder", "order", orderId, (err, info) => {
      if (info?.ok) {
        res(true);
      } else {
        rej(err);
      }
    });
  });
}

/** download orders from UkrSklad
 * @name downloadOrdersUkrSklad
 * @param {[String]} orderIds
 * @param {String} idShop
 * @param {downloadOrdersUkrSklad~fnProgress} fnProgress
 * @returns {Promise<unknown>}
 */
async function downloadOrdersUkrSklad(orderIds, idShop, fnProgress) {
  const result = [];
  //validation
  if (!Array.isArray(orderIds) || !orderIds.length) {
    return Promise.reject({ nameFn: "downloadOrdersUkrSklad", body: "Schould be array of numbers" });
  }
  const notString = orderIds.filter((num) => typeof num !== "string");
  if (notString.length) {
    return Promise.reject({ nameFn: "downloadOrdersUkrSklad", body: "Schould be array of numbers" });
  }
  for (let i = 0; i < orderIds.length; i++) {
    const item = await downloadOrder(orderIds[i], idShop);
    fnProgress(orderIds.length, i + 1);
    result.push(item);
  }
  return result;
  //send request to server for downloadOrder
  function downloadOrder(orderId, idShop) {
    return new Promise((resolve, reject) => {
      socket.emit("modules", "downloadOrder", orderId, idShop, (err, info) => {
        if (err) return reject(err);
        resolve(info);
      });
    });
  }
}

/**
 * @callback downloadOrdersUkrSklad~fnProgress
 * @param {Number} max
 * @param {Number} current
 */

/**
 * @name deleteOrder
 * @param id
 * @returns {Promise<unknown>}
 */
function deleteOrder(id) {
  return new Promise((res, rej) => {
    const sql = `SELECT NUM, IS_REZERV FROM SCHET WHERE NU = 'PROM-${id}'`;
    getData({ opt: option, sql }, (err, { data }) => {
      if (err) rej(err);
      if (!data || !data?.length) {
        rej({ status: "not found", text: `Заказ с номером документа PROM-${id} не найден` });
      } else {
        if (data[0].IS_REZERV) {
          modalAlert(`Невозможно удалить заказ 'PROM-${id}'. Oн в резерве. Для удаления снимите резерв.`);
          return rej({ err: `Невозможно удалить заказ 'PROM-${id}'. Oн в резерве. Для удаления снимите резерв.`, info: "deleteOrder()" });
        }
        const PID = data[0].NUM;
        const sql = `DELETE FROM SCHET_ WHERE PID = ${PID}`;
        getDataPromise("/sql/insert", option, sql)
          .then((d) => {
            const sql = `DELETE FROM SCHET WHERE NUM = ${PID}`;
            return getDataPromise("/sql/insert", option, sql);
          })
          .then((d) => res(d))
          .catch((err) => rej({ err: err, info: "deleteOrder()" }));
      }
    });
  });
}

function changeOnlineStatus(type) {
  const elem = $(".apxu-online-status");
  switch (type) {
    case "success":
      elem.removeClass("badge-danger");
      elem.addClass("badge-success");
      elem.html("В сети");
      return true;
    case "danger":
      elem.removeClass("badge-success");
      elem.addClass("badge-danger");
      elem.html("Нет сети");
      return false;
    default:
      console.error("Что то пошло не так", type);
      return false;
  }
}

function modalAlert(messageError) {
  const modalError = $("#modal-error");
  modalError.modal("show");
  $("#modal-error p.apxu-alert").html(messageError);
  modalError.on("hide.bs.modal", () => {
    $("#modal-error p.apxu-alert").html("");
    modalError.off("hide.bs.modal");
  });
}

//обработчик ошибок
function handlerError(err) {
  if (err.message) return err.message;
  else {
    console.error(err);
    return "";
  }
}

function getOrders(skip, cb) {
  socket.emit("getOrders", skip, (err, orders) => {
    cb(err, orders);
  });
}

//проверка запущен экспорт цен
function checkExport() {
  if (syncExport) onExport(selectExport); //запускаем експорт
}

function creatTable(orders) {
  let resault = "";
  const trash = `<svg class="bi bi-trash-fill" width="1em" height="1em" viewBox="0 0 16 16" 
                    fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" d="M2.5 1a1 1 0 00-1 1v1a1 1 0 001 
                    1H3v9a2 2 0 002 2h6a2 2 0 002-2V4h.5a1 1 0 001-1V2a1 1 0 00-1-1H10a1 
                    1 0 00-1-1H7a1 1 0 00-1 1H2.5zm3 4a.5.5 0 01.5.5v7a.5.5 0 01-1 0v-7a.5.5 
                    0 01.5-.5zM8 5a.5.5 0 01.5.5v7a.5.5 0 01-1 0v-7A.5.5 0 018 5zm3 .5a.5.5 0 
                    00-1 0v7a.5.5 0 001 0v-7z" clip-rule="evenodd"/>
                    </svg>`;
  orders.forEach((o, i) => {
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
  let resault = "";
  orders.forEach((o, i) => {
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
  let resault = "";
  elems.forEach((o, i) => {
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
  let resault = "";
  tips.forEach((o, i) => {
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
  let resault = "";
  tovar.forEach((o, i) => {
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
    $("#modal-groups .modal-body").html(`<button class="btn btn-sm btn-outline-dark send-group">Загрузить</button>
                                            <button class="btn btn-sm btn-outline-dark show-groups">Показать скрытые</button>
                                            <button class="btn btn-sm btn-outline-dark show-length">Кол-во товаров в группах</button>
                                            <div class="btn-group">
                                                <input class="apxu-search-world" type="text">
                                                <button class="btn btn-sm btn-outline-dark send-world">Загрузить</button>
                                                <p class="search-count">0</p>
                                            </div>
                                            <table class="table table-sm">
                                                <thead>
                                                    <tr>
                                                        <th scope="col">Название</th>
                                                        <th scope="col">Выбрать</th>
                                                        <th scope="col">Скрыть</th>
                                                    </tr>
                                                </thead>
                                                <tbody></tbody>
                                            </table>
                                            <button class="btn btn-sm btn-outline-dark send-group">Загрузить</button>
                                            <button class="btn btn-sm btn-outline-dark show-groups">Показать скрытые</button>
                                            <button class="btn btn-sm btn-outline-dark show-length">Кол-во товаров в группах</button>`);
    const tableBody = $("#modal-groups tbody");
    const icon = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-check" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" d="M10.97 4.97a.75.75 0 0 1 1.071 1.05l-3.992 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.236.236 0 0 1 .02-.022z"/>
            </svg>`;
    const iconHide = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" class="bi bi-eye-slash" viewBox="0 0 16 16">
            <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/>
            <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/>
            <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/>
            </svg>`;
    //sorts groups by level
    const data = groups
      .reduce((acc, cur) => {
        if (typeof acc[cur.LEVEL] === "undefined") acc[cur.LEVEL] = [];
        acc[cur.LEVEL].push(cur);
        return acc;
      }, [])
      .map((level, i) => {
        if (!i) return level.sort(sortByNAME);
        return level.sort(sortByNAMEReverse);
      });
    //template for tr
    function createTr(g) {
      return `<tr id="group-${g.NUM}" class="${!g.LEVEL ? "" : " hidden"} ${g.hide ? "hide" : ""}" data-level="${g.LEVEL}" data-group="${
        g.NUM
      }">
                <td class="group-name" style="padding-left: ${g.LEVEL}rem">${
        g.NAME
      }<span class="open-group open-g" onclick="openGroup(this)">(+)</span><span class="show-one-length pointer"> Кол-во товаров </span></td>
                <td>
                    <button class="btn btn-sm btn-outline-dark check-group" data-group="${g.NUM}">${icon}</button>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-dark ${g.hide ? "show-group" : "hide-group"}" data-group="${
        g.NUM
      }">${iconHide}</button>
                </td>
              </tr>`;
    }
    //выводим данные в таблицу
    data.forEach((level, i) => {
      level.forEach((g) => {
        if (!i) {
          tableBody.append(createTr(g));
        } else {
          const parent = $(`#group-${g.GRUPA}`);
          parent.after(createTr(g));
        }
      });
    });
    //выбрать группу
    $(".check-group").on("click", (e) => {
      if ($(e.currentTarget).hasClass("active")) {
        $(e.currentTarget).removeClass("active");
      } else $(e.currentTarget).addClass("active");
    });
    $(".send-group").on("click", (e) => {
      const result = { type: "group", value: [] };
      //собираем все кнопки
      const buttons = $(".check-group.active").toArray();
      buttons.forEach((b) => result.value.push(+b.dataset.group));
      res(result);
    });
    //скрыть группу
    $(".hide-group").on("click", (e) => {
      //отправляем на сохранение группу
      /** @member {String} num */
      const num = e.currentTarget.dataset.group;
      // ищем вложенность и добавляем все группы
      getNestingGroupsAsync([num]).then((arrayGroupsId) => {
        console.log(` arrayGroupsId: `, arrayGroupsId);
        instanceService.addManyConfigGroups(arrayGroupsId, (err) => {
          if (err && err.err) return console.log(err);
          arrayGroupsId.forEach((idGroup) => {
            //hide group
            $(`#group-${idGroup}`).addClass("hide");
            $(e.currentTarget).removeClass("hide-group").addClass("show-group");
          });
        });
      });
    });
    //показать скрытые группы
    $(".show-groups").on("click", (e) => {
      const hideGroups = $(".hide");
      for (const val of hideGroups) {
        $(val).removeClass("hide");
        $(val).find(".show-group").removeClass("btn-outline-dark").addClass("btn-outline-light");
      }
    });
    //показать группу
    $(".show-group").on("click", (e) => {
      const num = e.currentTarget.dataset.group;

      fetch("/config/delete?num=" + num)
        .then((r) => r.json())
        .then((d) => {
          if (!d.err) {
            //скрываем группу
            $(e.currentTarget).removeClass("btn-outline-light").addClass("btn-outline-dark");
          } else console.log(d);
        })
        .catch((err) => console.log(err));
    });
    //кол-во товаров в группах
    $(".show-length").on("click", (e) => {
      const groups = $("#modal-groups tbody tr");
      getLengthTip(groups);
    });
    //кол-во товаров в одной группе
    $(".show-one-length").on("click", (e) => {
      getLengthTip($(`#group-${e.target.parentElement.parentElement.dataset.group}`));
    });
    //событие на ввод текста
    $(".apxu-search-world").on("input", (e) => {
      console.log("input", e.target.value);
      const data = {
        opt: option,
        sql: `SELECT COUNT(*) FROM TOVAR_NAME WHERE NAME LIKE '%${e.target.value}%' AND (DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL)`,
      };
      getData(data, (err, res) => {
        console.log("count", res);
        $(".search-count").text(res.data[0].COUNT);
      });
    });
    //загрузить прайс по запросу
    $(".send-world").on("click", (e) => {
      res({ type: "keyWord", value: $(".apxu-search-world").val() });
    });
  });
}

//открыть закрыть группы
function openGroup(e) {
  //берем родителя и проверяем кто следующий
  const parent = e.parentElement.parentElement;
  if ($(e).hasClass("open-g")) {
    $(e).removeClass("open-g").addClass("close-g").text("(-)");
    unHidden(parent);
  } else if ($(e).hasClass("close-g")) {
    $(e).removeClass("close-g").addClass("open-g").text("(+)");
    addHidden(parent, parent.dataset.level);
  } else console.error("Этот кейс не должен сработать");

  function unHidden(parent) {
    if (parent.nextSibling && $(parent.nextSibling).hasClass("hidden")) {
      $(parent.nextSibling).removeClass("hidden");
      unHidden(parent.nextSibling);
    }
  }

  function addHidden(parent, lvl) {
    if (parent.nextSibling && parent.nextSibling.dataset.level > lvl) {
      $(parent.nextSibling).addClass("hidden");
      addHidden(parent.nextSibling, lvl);
    }
  }
}

//таблица групп
function createTable8(group, root) {
  return new Promise((res, rej) => {
    $("#modal-groups .modal-body").html(`<table class="table table-sm">
                                                <thead>
                                                    <tr>
                                                        <th scope="col">Название</th>
                                                        <th scope="col">Выбрать</th>
                                                    </tr>
                                                </thead>
                                                <tbody></tbody>
                                            </table>`);
    const tableBody = $("#modal-groups tbody");
    const icon = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-check" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" d="M10.97 4.97a.75.75 0 0 1 1.071 1.05l-3.992 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.236.236 0 0 1 .02-.022z"/>
                  </svg>`;
    //разложить группы по уровням
    const groups = group.groups
      .reduce((acc, cur) => {
        if (typeof acc[group.ids[cur.id].level] === "undefined") acc[group.ids[cur.id].level] = [];
        acc[group.ids[cur.id].level].push(cur);
        return acc;
      }, [])
      .map((elem, i) => {
        if (!i) return elem.sort(sortByName);
        return elem.sort(sortByNameReverse);
      });
    //выводим данные в таблицу
    groups.forEach((elem, i) => {
      elem.forEach((elem) => {
        const level = group.ids[elem.id].level;
        if (!i) {
          tableBody.append(getTr(elem, level));
        } else {
          const parent = $(`#group-${elem.parent_group_id}`);
          parent.after(getTr(elem, level));
        }
      });
    });
    //типлэйт для одного элемента таблицы
    function getTr(g, lvl) {
      return `<tr id="group-${g.id}" class="${!lvl ? "" : " hidden"}" data-level="${lvl}">
                <td class="group-name" style="padding-left: ${lvl}rem">${g.name}<span class="open-group open-g">(+)</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-dark send-group" data-group="${g.id}">${icon}</button>
                </td>
              </tr>`;
    }

    $(".send-group").on("click", (e) => {
      res(e);
    });
    //открыть закрыть группы
    $(".open-group").on("click", (e) => {
      //берем родителя и проверяем кто следующий
      const parent = e.target.parentElement.parentElement;
      if ($(e.target).hasClass("open-g")) {
        $(e.target).removeClass("open-g").addClass("close-g").text("(-)");
        unHidden(parent);
      } else if ($(e.target).hasClass("close-g")) {
        $(e.target).removeClass("close-g").addClass("open-g").text("(+)");
        addHidden(parent, parent.dataset.level);
      } else console.error("Этот кейс не должен сработать");
    });

    function unHidden(parent) {
      if (parent.nextSibling && $(parent.nextSibling).hasClass("hidden")) {
        $(parent.nextSibling).removeClass("hidden");
        unHidden(parent.nextSibling);
      }
    }

    function addHidden(parent, lvl) {
      if (parent.nextSibling && parent.nextSibling.dataset.level > lvl) {
        $(parent.nextSibling).addClass("hidden");
        addHidden(parent.nextSibling, lvl);
      }
    }
  });
}

//сортировка по имени
function sortByName(a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}
//сортировка по имени в обратном порядке
function sortByNameReverse(a, b) {
  if (a.name > b.name) return -1;
  if (a.name < b.name) return 1;
  return 0;
}

function sortByNAME(a, b) {
  if (a.NAME < b.NAME) return -1;
  if (a.NAME > b.NAME) return 1;
  return 0;
}
//сортировка по имени в обратном порядке
function sortByNAMEReverse(a, b) {
  if (a.NAME > b.NAME) return -1;
  if (a.NAME < b.NAME) return 1;
  return 0;
}

//узнать кол-во товаров
function getLengthTip(groups) {
  let i = 0;
  start();

  function start() {
    if (!isOpenModalGroups) return;
    if (i === groups.length) return;
    const sql = `SELECT COUNT(*) FROM TOVAR_NAME WHERE TIP=${groups[i].dataset.group} AND (DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL)`;
    const data = { opt: option, sql };
    getData(data, (err, count) => {
      if (!count.data) console.log(`getLengthTip => error, count, sql: `, err, count, sql);
      else {
        const name = $(groups[i]).find(".group-name");
        name[0].innerHTML += `(${count.data[0].COUNT})`;
      }
      i++;
      start();
    });
  }
}

function progress(status, title, total, step) {
  if (status) {
    $(".progress").removeClass("hidden");
    const proc = (100 / total) * step;
    $(".progress-bar")
      .attr({ "aria-valuenow": proc, style: `width:${proc}%` })
      .html(`${title}:${total}/${step}`);
  } else {
    $(".progress").addClass("hidden");
  }
}

//запись в базу данных
function insertBD(opt, sql) {
  return new Promise((res, rej) => {
    getDataPromise("/sql/insert", opt, sql)
      .then((data) => {
        if (data.status === "ok") {
          res(data);
        } else {
          console.log(data);
          rej(new Error(`Во время записи что то пошло не так: ${data}`));
        }
      })
      .catch((err) => rej(err));
  });
}

//выборка с базы блобов
function blobBD(opt, sql, blob) {
  return new Promise((res, rej) => {
    getDataPromise("/sql/blob", opt, sql, blob)
      .then((data) => res(data))
      .catch((err) => rej(err));
  });
}

//загрузка в базу блоб
function saveBlobBD(opt, data) {
  return new Promise((res, rej) => {
    fetch("/sql/saveBlob", {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
      },
      body: JSON.stringify({ opt: opt, data: data }),
    })
      .then((r) => r.json())
      .then((data) => res(data))
      .catch((err) => {
        console.error(err);
        rej(err);
      });
  });
}

//выборка с базы данных
function selectBD(opt, sql) {
  return new Promise((res, rej) => {
    getDataPromise("/sql/select", opt, sql)
      .then((data) => res(data))
      .catch((err) => rej(err));
  });
}

//стираем синхронизацию
function removeSync(e, data) {
  socket.emit("removeSync", data, (err, info) => {
    if (info.ok) {
      e.parentNode.parentNode.children[1].innerHTML = "1970-01-01T00:00:00.000Z(UTC +0)";
      e.parentNode.parentNode.children[2].innerHTML = 0;
    }
  });
}

//получить данные из файрбирд
function getDataPromise(url, option, sql, blob, data) {
  // const url = '/sql/select';
  // const sql = 'SELECT * FROM TIP';
  return new Promise((res, rej) => {
    if (!url) rej(new Error("URL отсутствует"));
    if (!option) rej(new Error("Отсудствуют опции для подключения к БД"));
    if (!sql) rej(new Error("SQL запрос отсутствует"));
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
      },
      body: JSON.stringify({ opt: option, sql: sql, blob: blob, data: data }),
    })
      .then((r) => r.json())
      .then((data) => res(data))
      .catch((err) => {
        console.error(err);
        rej(err);
      });
  });
}

//открываем информационное окно
function openInfoWindow(info, showInput, autoClose) {
  if (autoClose) return Promise.resolve({ status: true, value: $("#input-info").val() });
  $("#modal-info").modal("show");
  if (showInput) $("#input-info").removeClass("hidden");
  $(".apxu-info-alert").html(info);
  return new Promise((res, rej) => {
    $(".apxu-yes").on("click", () => {
      res({ status: true, value: $("#input-info").val() });
      $("#modal-info").modal("hide");
      $("#input-info").addClass("hidden").val("");
      $(".apxu-yes").off("click");
      $(".apxu-no").off("click");
    });
    $(".apxu-no").on("click", () => {
      res({ status: false, value: null });
      $("#modal-info").modal("hide");
      $("#input-info").addClass("hidden");
      $(".apxu-no").off("click");
      $(".apxu-yes").off("click");
    });
  });
}

//открываем окно выбора товара
function openSelTovarWindow(elems) {
  $("#modal-select-tovar").modal("show");
  $("#modal-select-tovar tbody").html(createTable3(elems));
  return new Promise((res, rej) => {
    $(".submit-tovar").on("click", () => {
      const elems = $("#modal-select-tovar tbody input[type=radio]:checked");
      if (!elems.length) rej("Товар не выбран");
      else res(+elems[0].dataset.id);
      $("#modal-select-tovar").modal("hide");
      $(".submit-tovar").off();
    });
    $("#modal-select-tovar").on("hidden.bs.modal", (e) => {
      rej("Окно закрыто");
    });
  });
}

//ищем нужный обьект
function serchElem(group, p) {
  console.log(group);
  if (group.length === 1) {
    return group[0].NUM;
  } else {
    //делим количество на два
    const index = Math.ceil(group.length / 2);
    if (p.product.name.charAt(1) <= group[index].NAME.charAt(1)) {
      //m < z
      //если вторая буква меньше возв первую половину массива
      return serchElem(group.slice(0, index), p);
    } else {
      return serchElem(group.slice(index, group.length), p);
    }
  }
}

//открываем окно для выбора заказов
function printOrders(orders) {
  $("#modal-select-orders").modal("show");
  return new Promise((res, rej) => {
    $("#modal-select-orders").find("tbody").html(createTable2(orders));
    $(".submit-orders").on("click", (e) => {
      $(".submit-orders").off();
      //console.log(e);
      const checked = $("#modal-select-orders input:checked");
      const result = [];
      for (let i = 0; i < checked.length; i++) {
        orders.forEach((o) => {
          if (checked[i].dataset.id == o.id) {
            result.push(o);
          }
        });
      }
      $("#modal-select-orders").modal("hide");
      res(result);
    });
  });
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
    fetch("/sql/checkconnection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
      },
      body: JSON.stringify({ opt: option }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.connected) {
          $("#modal-lost-connection").modal("show");
        } else {
          $("#modal-lost-connection").modal("hide");
          res(func);
        }
      })
      .catch((err) => {
        console.log(err);
        //открываем окно с ошибкой
        $("#modal-lost-connection").modal("show");
      });
  });
}

//проверка есть ли в базе сохраненные товары
function checkDB() {
  return new Promise((res, rej) => {
    socket.emit("syncInfo", (err, data) => {
      console.log(err, data);
      if (data.prom_q && data.ukr_q) {
        //вывести окно, с предупреждением, что в баз есть данные с прошлого экспорта
        //если эти данные не с этого экспорта лучше их очистить что бы в таблицу
        //не попали товары с других групп
        //вывести две кнопки, продолжить или отмена
        $("#modal-groups .modal-body").html(`<p>Если вы видите это окно значит с прошлого экспорта в базе
                                                    остались данные, во избежания экспорта других товаров (товаров 
                                                    из других групп) рекомендуем очисть прошлую синхронизацию в 
                                                    Настройках</p>
                                                    <div class="btn-group" role="group">
                                                          <button type="button" class="btn btn-outline-dark" data-btn="1">Продолжить</button>
                                                          <button type="button" class="btn btn-outline-dark" data-btn="0">Отменить</button>
                                                    </div>`);
        $("#modal-groups .modal-body button").on("click", (e) => {
          if (+e.currentTarget.dataset.btn) res(true);
          else res(false);
        });
      } else {
        res(true);
      }
    });
  });
}

//подписываемся на сообщения о статусе
function status() {
  if (!sentStatus) {
    sentStatus = true;
    start();

    //let data = '';
    function start(data) {
      if (sentStatus) {
        console.log("status");
        const query = data ? `?${data}` : "";
        fetch("/sql/status" + query, {
          method: "GET",
          headers: {
            "Content-Type": "application/json;charset=utf-8",
          },
        })
          .then((res) => res.json())
          .then((data) => {
            showAlert(data.info);
            if (data.request === "Сохранять изменения в УкрСклад?") {
              openInfoWindow(data.request).then((res) => start(`saveFile=${res.status}&removeRequest=true`));
            } else if (data.status) {
              setTimeout(start, 1000);
            } else {
              showAlert("Слежение окончено");
              sentStatus = false;
            }
          })
          .catch((err) => console.log(err));
      } else {
        showAlert("Слежение остановлено");
      }
    }
  } else {
    console.log("Проверка статуса уже включена, повтороно включить не получится");
  }
}

//остановить подписку на статус
function stopWatch() {
  sentStatus = false;
}

//вывод сообщения
function showAlert(html, type = "info", timeout = 20000) {
  $(".alert").html(html).removeClass("hidden").addClass(`alert-${type}`);
  console.log("alert", html);
  setTimeout(() => {
    $(".alert").addClass("hidden").removeClass(`alert-${type}`);
  }, timeout);
}

//сортировка групп
function sortGroup(groups, root) {
  return new Promise((res, rej) => {
    let result = [];
    let level = 0;
    const children = [];
    const obj = {};
    start([{ NUM: root }]);

    function start(roots) {
      const parentGroups = [];
      if (!roots.length) res(result);
      else {
        roots.forEach((r) => {
          groups.forEach((g) => {
            if (r.NUM === g.NUM) {
              //не чего не делаем
            } else if (r.NUM === g.GRUPA) {
              g.LEVEL = level;
              parentGroups.push(g);
            }
          });
        });
        result = [...result, ...parentGroups];
        level++;
        start(parentGroups);
      }
    }
  });
}
//сортировка групп 2
function sortGroup2(groups) {
  const results = {};
  groups.forEach((g) => {
    results[g.NUM] = g;
    if (results[g.GRUPA]) {
      if (!results[g.GRUPA]["children"]) results[g.GRUPA]["children"] = [];
      results[g.GRUPA]["children"].push(g.NUM);
    }
  });
  return results;
}

//поиск в базе неподдерживаемых символов
async function calib() {
  //проверяем базу на неподдерживаемые символы
  //берем все товары SELECT NUM, NAME FROM TOVAR_NAME
  await test3();
  const result = [];
  const data = {
    opt: option,
    sql: `SELECT NUM, NAME, DOPOLN4 FROM TOVAR_NAME WHERE (DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL)`,
  };
  getData(data, (err, tovar) => {
    console.log(tovar);
    if (tovar && tovar.data) {
      tovar.data.forEach((t) => {
        if (t.NAME && t.NAME.indexOf(`'`) !== -1) {
          result.push(t);
        }
      });
    } else {
      //данных нет, база пуста
      modalAlert("База пустая");
    }
    console.log("Список товаров c проблемным символом('):", result);
    const backspace = "’";
    if (result.length)
      showAlert(
        `Найдено ${
          result.length
        } товаров c проблемным символом(') рекомендуем его заменить (например на ${backspace} или на любой вам удобный символ). ${
          t.console + t.warning
        }`,
        "danger",
        60000
      );
    //поиск удаленных позиций
    //SKLAD_ID 1=товар в наличии, -20=производство, -1=нет на балансе, -10=резерв нет на балансе, 0=нет на балансе
    getData({ opt: option, sql: "SELECT TOVAR_ID FROM TOVAR_ZAL WHERE NOT(SKLAD_ID IN (-10, -20))" }, (err, zal) => {
      const zalObj = {};
      if (zal?.data) {
        zal.data.forEach((z) => (zalObj[z.TOVAR_ID] = z.TOVAR_ID)); //tovar[1,2,3,4,5] zal[2,3]

        const result2 = tovar.data.filter((t) => {
          if (!zalObj[t.NUM]) return t;
        });
        console.log("товары не отмеченые как удаленные", result2);
        if (result2.length)
          showAlert(`Найдено ${result2.length} товаров не отмеченых как удаленные. ${t.console + t.warning + t.setting}`, "danger", 180000);
      } else {
        //данных нет, база пуста
        modalAlert("База пустая");
      }
      //проверить сколько позиций с статусом DELETE и Prom-ID
      //получить имя поля для Prom-ID
      socket.emit("getAdditionalField", "object", (fields) => {
        //console.log(fields);
        if (fields.promId) {
          getData(
            {
              opt: option,
              sql: `SELECT NUM, NAME, ${fields.promId} FROM TOVAR_NAME WHERE (DOPOLN4 = 'DELETED' AND NOT(${fields.promId} IS NULL))`,
            },
            (err, tovar2) => {
              console.log("Удаленных товаров с Пром ИД", tovar2);
              if (Array.isArray(tovar2?.data) && tovar2?.data.length)
                showAlert(
                  `Найдено ${tovar2.data.length} товаров с пром ИД и статусом 'DELETED'. ${t.console + t.warning + t.setting}`,
                  "danger",
                  180000
                );
            }
          );
          //поиск товаров с невалидными значениями(не числа) в колонке для Prom-ID
          getData(
            {
              opt: option,
              sql: `SELECT NUM, NAME, ${fields.promId} FROM TOVAR_NAME WHERE ((DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL) AND NOT(${fields.promId} IS NULL))`,
            },
            (err, tovar3) => {
              //поиск товаров с нечисленным значением
              if (tovar3?.data.length) {
                const result3 = [];
                tovar3.data.forEach((t) => {
                  if (isNaN(Number(t[fields.promId]))) {
                    result3.push(t);
                  }
                });
                console.log(`Товары с невалидными данными в поле для Пром-ИД(${fields.promId})`, result3);
                if (result3.length)
                  showAlert(
                    `Найдено ${result3.length} товаров с невалидными данными в поле для Пром-ИД(${fields.promId}). ${
                      t.console + t.warning
                    }`,
                    "danger",
                    120000
                  );
              }
            }
          );
        } else {
          console.log("Поле для сохранения Prom ID отсутствует");
        }
      });
    });
  });
}

//auto fix unsupported simbols
function calibAuto() {
  $("#modal-settings").modal("hide");
  const result = [];
  let result2;
  let result3;
  let promId;
  let i = 0;
  const data = {
    opt: option,
    sql: `SELECT NUM, NAME, DOPOLN4 FROM TOVAR_NAME WHERE (DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL)`,
  };
  getData(data, (err, res) => {
    console.log(res);
    if (res.data) {
      res.data.forEach((t) => {
        if (t.NAME && t.NAME.indexOf(`'`) !== -1) {
          result.push(t);
        }
      });
    } else {
      //данных нет, база пуста
      modalAlert("База пустая");
    }
    console.log(result);
    //поиск удаленных позиций
    getData({ opt: option, sql: "SELECT TOVAR_ID FROM TOVAR_ZAL WHERE NOT(SKLAD_ID IN (-10, -20))" }, (err, zal) => {
      const zalObj = {};
      if (zal.data) {
        zal.data.forEach((z) => (zalObj[z.TOVAR_ID] = z.TOVAR_ID)); //tovar[1,2,3,4,5] zal[2,3]
        result2 = res.data.filter((t) => {
          if (!zalObj[t.NUM]) return t;
        });
        console.log(result2);
      } else {
        //данных нет, база пуста
        modalAlert("База пустая");
      }
      //проверить сколько позиций с статусом DELETE и Prom-ID
      //получить имя поля для Prom-ID
      socket.emit("getAdditionalField", "object", (fields) => {
        //console.log(fields);
        promId = fields.promId;
        if (promId) {
          getData(
            {
              opt: option,
              sql: `SELECT NUM, NAME, ${promId} FROM TOVAR_NAME WHERE (DOPOLN4 = 'DELETED' AND NOT(${promId} IS NULL))`,
            },
            (err, tovar) => {
              console.log("Удаленных товаров с Пром ИД", tovar);
              if (tovar.data) {
                result3 = tovar.data;
                start();
              } else {
                //данных нет, база пуста
                modalAlert("База пустая");
              }
            }
          );
        } else {
          console.log("Поле для сохранения Prom ID отсутствует");
        }
      });

      //update prods
      function start() {
        if (i === result.length) {
          progress(false);
          showAlert(`Исправление окончено, изменено ${result.length} названий`);
          //запускаем вторую функцию
          i = 0;
          start2();
        } else {
          progress(true, "Исправляю неподдерживаемые символы", result.length, i);
          const sql = `UPDATE TOVAR_NAME SET NAME = '${result[i].NAME.replace(/'/g, `"`)}' WHERE NUM = ${result[i].NUM}`;
          insertBD(option, sql)
            .then(() => {
              i++;
              start();
            })
            .catch((err) => console.log(err));
        }
      }

      function start2() {
        if (i === result2.length) {
          progress(false);
          showAlert(`Исправление окончено, изменено ${result2.length} позиций`);
          //запускаем вторую функцию
          i = 0;
          if (promId) start3();
          else console.log("Поле для записи Prom ID отсутствует");
        } else {
          progress(true, "Добавление в удаленные позиции статус DELETED", result2.length, i);
          const sql = `UPDATE TOVAR_NAME SET DOPOLN4 = 'DELETED' WHERE NUM = ${result2[i].NUM}`;
          insertBD(option, sql)
            .then(() => {
              i++;
              start2();
            })
            .catch((err) => console.log(err));
        }
      }

      function start3() {
        if (i === result3.length) {
          progress(false);
          showAlert(`Исправление окончено, изменено ${result3.length} позиций`);
        } else {
          progress(true, "Очистка поля PromID в удаленных позициях", result3.length, i);
          const sql = `UPDATE TOVAR_NAME SET ${promId} = NULL WHERE NUM = ${result3[i].NUM}`;
          insertBD(option, sql)
            .then(() => {
              i++;
              start3();
            })
            .catch((err) => console.log(err));
        }
      }
    });
  });
}

//загрузка фото
function downloadPhoto(byGroup, e) {
  $(e).attr("disabled", true);
  //отправляем запрос на сервер, что бы получить список фото
  socket.emit("downloadPhoto", byGroup, (err, images) => {
    if (err) console.log(err);
    saveImages(images).then((r) => {
      showAlert(r);
      $(e).attr("disabled", false);
    });
  });
}

//сохранение фото
function saveImages(images) {
  return new Promise((res, rej) => {
    let i = 0;
    start();

    function start() {
      if (i === images.length) {
        progress(false);
        res("Загрузка фото окончена");
      } else {
        const data = images[i];
        if (data.URL.indexOf("https://images.ua.prom.st/") !== -1) {
          saveBlobBD(option, data).then((r) => {
            progress(true, "Загрузка изоброжений", images.length, i);
            if (!r.ok) console.log(r);
            i++;
            start();
          });
        } else {
          console.log("Неверный URL изоброжения", data);
          i++;
          start();
        }
      }
    }
  });
}

//удалить фото без ID
function removePhotoWithoutId(e) {
  $(e).attr("disabled", true);
  //получаем список товаров с id
  const sql = `SELECT NUM, DOPOLN5 FROM TOVAR_NAME WHERE (DOPOLN5 = '' OR DOPOLN5 is NULL)`;
  let prodsWithOutId, images;
  selectBD(option, sql)
    .then((prods) => {
      prodsWithOutId = prods.data;
      //получаем список фото
      return selectBD(option, `SELECT NUM, TOVAR_ID FROM TOVAR_IMAGES`);
    })
    .then((tovarImages) => {
      images = tovarImages.data;
      //сравниваем
      return compareImagesAndTovar(images, prodsWithOutId);
    })
    .then((imgForRemove) => {
      console.log(imgForRemove);
      //удаляем фото позиций без ID
      return removePhoto(imgForRemove);
    })
    .then(() => {
      console.log("Удаление изоброжений окончено");
      $(e).attr("disabled", false);
    });
}

//сравнить tovar_images и tovar_name
function compareImagesAndTovar(images, tovar) {
  const result = [];
  const objImg = {};
  const objTov = {};
  images.forEach((i) => (objImg[i.TOVAR_ID] = i));
  tovar.forEach((t) => (objTov[t.NUM] = t));
  for (let k in objImg) {
    if (typeof objTov[k] !== "undefined") {
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
        showAlert("Удаление изоброжений окончено:" + arr.length);
        res();
      } else {
        const sql = `DELETE FROM TOVAR_IMAGES WHERE NUM = ${arr[i].NUM}`;
        insertBD(option, sql)
          .then(() => {
            progress(true, "Удаление изображений", arr.length, i);
            i++;
            start();
          })
          .catch((err) => console.log(err));
      }
    }
  });
}

//save changes
function saveChanges(e) {
  $(e).attr("disabled", true);
  showAlert("Сохраняю изменения...");
  fetch("sql/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify({ opt: option }),
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.err) {
        showAlert(res.err, "danger", 180000);
      } else {
        showAlert(res.data);
      }
      $(e).attr("disabled", false);
    });
}

//show modules
function showModules(modules) {
  if (Array.isArray(modules) && modules.length) modules.forEach((m) => $(`.${m}`).removeClass("hidden"));
}

function checkDouble() {
  const result = [];
  const sql = `SELECT NUM, DOPOLN5 FROM TOVAR_NAME WHERE ((DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL) AND NOT(DOPOLN5 IS NULL))`;
  setTimeout(() => {
    selectBD(option, sql).then((r) => {
      if (!r.data || !r.data.length) {
        return modalAlert("ВНИМАНИЕ: Приложение подключено к пустой базе");
      }
      console.log("checkDouble", r);
      const obj = {};
      r.data.forEach((d) => {
        if (d.DOPOLN5) {
          if (!obj[d.DOPOLN5]) obj[d.DOPOLN5] = d.NUM;
          else {
            result.push(d);
          }
        }
      });
      if (result.length) {
        showAlert(
          "ВНИМАНИЕ. Найдены дублекаты Пром ИД. Рекоменуем устранить неисправность, программа может работать некоректно. Список дубликатов вы можите посмотреть в консоле (Ctrl + Shift + i)"
        );
        console.log("Дубли", result);
      }
    });
  }, 2000);
}

//сохранение товара
function test3() {
  const result = [];
  const sql = `SELECT NUM, KOD FROM TOVAR_NAME WHERE ((DOPOLN4 != 'DELETED' OR DOPOLN4 IS NULL) AND NOT(KOD IS NULL))`;
  return selectBD(option, sql).then((r) => {
    console.log(r.data.length);
    const obj = {};
    r.data.forEach((d) => {
      if (d.KOD) {
        if (!obj[d.KOD]) obj[d.KOD] = d.NUM;
        else {
          result.push(d);
        }
      }
    });
    if (result.length) {
      showAlert(`Найдены дублекаты кодов товаров(KOD) ${result.length}шт. ${t.console}`, "warning", 60000);
      console.log("Дубли:", result);
    }
  });
}

//очистить TOVAR_NAME от записи 'DELETED' в DOPOLN4
async function test4() {
  // get all row TOVAR_ZAL
  const sql = `SELECT NUM, TOVAR_ID, SKLAD_ID FROM TOVAR_ZAL`;
  const r = await selectBD(option, sql);
  // filter row with SKLAD_ID = 1 and TOVAR_ID have duplicate
  const arr = r.data.filter((d) => d.SKLAD_ID === 1);
  const obj = {};
  const result = [];
  arr.forEach((a) => {
    if (!obj[a.TOVAR_ID]) obj[a.TOVAR_ID] = a.NUM;
    else {
      // delete row with duplicate
      result.push(a);
    }
  });
  for (const one of result) {
    const sql = `DELETE FROM TOVAR_ZAL WHERE NUM = ${one.NUM}`;
    const res = await insertBD(option, sql);
    console.log("delete", res);
  }
  console.log("ZAL", result);
}

//установка свитча
function stateSwitch(info) {
  if (info) $("#customSwitch1").prop("checked", true);
}

//показать модалку для сборочной накладной
function showModalCombineOrders() {
  $("#modal-settings").modal("hide");
  $("#modal-combine-orders").modal("show");
}

//создать накладную на основе выбранных заказов
function createInvoiceByList() {
  //получить список заказов
  const value = $('#modal-combine-orders input[aria-describedby="button-order-list"]').val();
  if (!value) return showAlert("Вы не ввели названия накладных");
  const orders = value.split(",").map((v) => v.trim());
  //отправить данные на сервер
  socket.emit("modules", "createInvoice", orders, null, (err, res) => {
    if (err) return showAlert(err);
    console.log(" createInvoice: ", res);
  });
  //обьединить информацию о заказах в одну накладную
  //сохранить накладную в бд
}

//показать модалку с выбором заказов для обьединения
function showOrders() {
  $("#modal-combine-orders").modal("hide");
  const date = $('#modal-combine-orders input[aria-describedby="button-show-orders"]').val().split(" ");
  if (!date) return showAlert("Вы не ввели датту", "warning");
  $("#modal-orders-list").modal("show");
  socket.emit("modules", "getOrders", date, null, (err, res) => {
    if (err) return showAlert(err);
    //валидация данных
    if (!Array.isArray(res) || !res.length) {
      $("#modal-orders-list").modal("hide");
      return showAlert("Нет заказов на эту дату", "warning");
    }
    //заполнить таблицу данными
    const table = $("#modal-orders-list table tbody");
    //создать строку таблицы
    const createRow = (d, index) => {
      return `<tr data-id="${d.NUM}">
          <th>${index + 1}</th>
          <td>${d.NU}</td>
          <td>${d.CLIENT}</td>
          <td>${d.CENA}</td>
          <td>${new Date(d.DATE_DOK).toLocaleDateString("fr-ca")}</td>
          <td>
            <input type="checkbox" name="invoice" data-id="${d.NUM}" data-nu="${d.NU}" data-count="${d.COUNT}">
          </td>
        </tr>`;
    };
    //заполнить таблицу
    table.html(res.map((d, index) => createRow(d, index)).join(""));
  });
}

//создать накладную
function createInvoice() {
  //получить список заказов
  const inputs = $('#modal-orders-list table tbody input[name="invoice"]:checked');
  if (!inputs.length) return showAlert("Вы не выбрали заказы", "warning");
  const orders = [];
  for (let i = 0; i < inputs.length; i++) {
    orders.push({ id: +inputs[i].dataset.id, nu: inputs[i].dataset.nu, count: inputs[i].dataset.count });
  }
  //закрыть модалку
  $("#modal-orders-list").modal("hide");
  //вывести сообщение о загрузке
  showAlert("Загрузка данных...", "info");
  //создаем имя накладной из даты и времени
  const date = new Date();
  const name = `SN-${date.getFullYear()}-${
    date.getMonth() + 1
  }-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  //отправить данные на сервер
  socket.emit("modules", "createInvoiceByNum", { orders, name }, null, (err, res) => {
    if (err) return showAlert(err, "danger");
    showAlert("Накладная создана", "success");
  });
}

//выделяем все заказы
function checkAllOrders(e) {
  const boxes = $('#modal-orders-list input[name="invoice"]');
  for (let i = 0; i < boxes.length; i++) {
    boxes[i].checked = !!e.checked;
  }
}

//загрузить имена товаров на другом языке
function downloadLang() {
  //закрыть модалку
  $("#modal-settings").modal("hide");
  //откыть модалку с списком групп
  socket.emit("modules", "multilang", null, null, (err, res) => {
    if (err) return showAlert(err);
    console.log(" downloadLang: ", res);
  });
}

//delete PromID not exist
function deletePromID(switcher) {
  //deletePromIDNotExist;
  deletePromIDNotExist(switcher).then((res) => {
    console.log("deletePromID", res);
  });
}

$("#modal-import").on("hidden.bs.modal", (e) => {
  $(e.target).find(".apxu-import-alert").html("");
  $(e.target).find("input").val("");
});
$("#modal-info").on("hidden.bs.modal", (e) => {
  $(".apxu-info-alert").html("");
  $(".apxu-yes").off();
  $(".apxu-no").off();
});
$("#modal-price").on("hidden.bs.modal", (e) => {
  $(e.target).find(".price-tip tbody").html("");
  $(e.target).find(".price-tovar tbody").html("");
  $(e.target).find(".price-tip").removeClass("hidden");
  $(e.target).find(".price-tovar").addClass("hidden");
});
$("#modal-import").on("shown.bs.modal", (e) => {
  $("#modal-import input").val(getTwoDate());
});
$("#modal-groups").on("hidden.bs.modal", (e) => {
  $("#modal-groups .modal-body").html("");
});
$("#customSwitch1").change((e) => {
  if (e.target.checked) {
    //поиск по ID включен
    //найти поле для поиска ID
    if (online) {
      socket.emit("getNameTableForId", (name) => {
        console.log(name);
        //проверить базу на наличие ID
        const sql = `SELECT COUNT(*) FROM TOVAR_NAME WHERE NOT(${name} = '' OR ${name} is NULL)`;
        selectBD(option, sql).then((prodsWithId) => {
          console.log(prodsWithId.data[0].COUNT);
          if (!prodsWithId.data[0].COUNT) {
            $("#customSwitch1").prop("checked", false);
            alert("Этот режим недоступен, у вас нет товаров с ID");
          } else {
            //записываем значение переключателя в БД
            socket.emit("updateSearchId", true, (err, info) => {
              console.log(err, info);
            });
            const sql = `SELECT COUNT(*) FROM TOVAR_NAME`;
            selectBD(option, sql).then((allProds) => {
              alert(`У вас ${prodsWithId.data[0].COUNT} товаров с ID из ${allProds.data[0].COUNT}.`);
            });
          }
        });
      });
    }
  } else {
    socket.emit("updateSearchId", false, (err, info) => {
      console.log(err, info);
    });
  }
});
$("#modal-select-orders").on("hidden.bs.modal", (e) => {
  progress(false);
});
$("#modal-groups").on("shown.bs.modal", (e) => {
  isOpenModalGroups = true;
});
$("#modal-groups").on("hidden.bs.modal", (e) => {
  isOpenModalGroups = false;
});
//при открытии модалки установить даты
$("#modal-combine-orders").on("shown.bs.modal", (e) => {
  $('#modal-combine-orders input[aria-describedby="button-show-orders"]').val(getTwoDate());
});
//texts
const t = {
  console: "Список в консоли (Ctrl+Shift+I). Вкладка Console. ",
  warning: "Если вы не исправити ошибку, то далее программа будет работать некорректно. ",
  setting:
    'Эту ошибку можно исправить автоматически, в настройках. Нажмите на кнопку с изоброжением шестиренки в правом верхнем углу и в открывшемся окне нажмите кнопку "Авто калибровка"',
};
