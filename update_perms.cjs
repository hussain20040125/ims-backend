const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  await db.collection('rolepermissions').updateMany(
    { role: { $in: ['AGM', 'Project Manager', 'Site Engineer'] } },
    { $addToSet: { permissions: { $each: ['CREATE_MATERIAL_PLAN', 'EDIT_MATERIAL_PLAN', 'DELETE_MATERIAL_PLAN'] } } }
  );
  console.log('Permissions updated!');
  process.exit(0);
});
