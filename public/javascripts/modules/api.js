/** get fields for id prom.ua
 * @name getFieldsForIdProm
 * @return {Promise<String>}
 */
function getFieldsForProm(data) {
  if (!socket || !socket?.connected) {
    return Promise.reject('Socket is not connected');
  }
  return new Promise((resolve, reject) => {
    socket.emit('modules', 'createFilesForChangePrice', data, null, (err, fields) => {
      if (err) {
        reject(err);
      } else {
        resolve(fields);
      }
    });
  });
}
