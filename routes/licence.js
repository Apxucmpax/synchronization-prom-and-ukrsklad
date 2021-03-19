const express = require('express');
const router = express.Router();

router
    .get('/', (req, res) => {
    res.render('licence', { title: 'Продление лецензии' });
});

module.exports = router;