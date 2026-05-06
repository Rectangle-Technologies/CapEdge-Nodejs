const multer = require('multer');

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname)) {
    return cb(null, true);
  }
  const error = new Error('Only PDF files are allowed');
  error.statusCode = 400;
  error.reasonCode = 'BAD_REQUEST';
  return cb(error);
};

const contractUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 }
});

module.exports = contractUpload;
