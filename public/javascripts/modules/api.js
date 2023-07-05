/** get fields for id prom.ua
 * @name getFieldsForIdProm
 * @return {Promise<String>}
 */
function getFieldsForProm(data) {
  if (!socket || !socket?.connected) {
    return Promise.reject("Socket is not connected");
  }
  return new Promise((resolve, reject) => {
    socket.emit("modules", "createFilesForChangePrice", data, null, (err, fields) => {
      if (err) {
        reject(err);
      } else {
        resolve(fields);
      }
    });
  });
}

/** delete PromID does not exist
 * @name deletePromIDNotExist
 * @return {Promise<String>}
 */
function deletePromIDNotExist(switcher) {
  if (!socket || !socket?.connected) {
    return Promise.reject("Socket is not connected");
  }
  return new Promise((resolve, reject) => {
    socket.emit("modules", "deletePromID", null, switcher, (err, products) => {
      if (err) {
        reject(err);
      } else {
        resolve(products);
      }
    });
  });
}
