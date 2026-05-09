const express = require('express');
const router = express.Router();
const { getDbStatus } = require('../controllers/dbStatusController');

router.get('/', getDbStatus);

module.exports = router;