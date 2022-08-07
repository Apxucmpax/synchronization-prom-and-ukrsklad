async function createFilesForChangePrice() {
  try {
    //get price
    const res = await fetch('sql/getPrice');
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    //get body
    const body = await res.json();
    //send request to server
    getFieldsForProm(body)
      .then(info => {
        if (typeof showAlert === 'function') showAlert(info);
        else console.log(" getFieldsForProm: ", info);
      })
      .catch(err => {
        if (typeof showAlert === 'function') {
          showAlert(err, 'danger');
        }
        else console.log(" getFieldsForProm: ", err);
      });
  } catch (err) {
    if (typeof showAlert === 'function') {
      showAlert(err, 'danger');
    } else {
      console.log(err);
    }
  }
}
