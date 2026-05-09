/**
 * Standardized API Response Helpers
 * Ensures consistent response format across all endpoints
 */

/**
 * Success response helper
 * @param {Object} res - Express response object
 * @param {any} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
const success = (res, data = null, message = 'Success', statusCode = 200) => {
  const response = {
    success: true,
    message,
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Error response helper
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Array|Object} errors - Validation errors or additional error details
 */
const error = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

/**
 * Paginated response helper
 * @param {Object} res - Express response object
 * @param {Array} data - Array of items
 * @param {Object} pagination - Pagination metadata { page, limit, total, totalPages }
 * @param {string} message - Success message
 */
const paginated = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      currentPage: pagination.page,
      totalPages: pagination.totalPages,
      totalItems: pagination.total,
      itemsPerPage: pagination.limit,
      hasNextPage: pagination.page < pagination.totalPages,
      hasPrevPage: pagination.page > 1,
    },
  });
};

/**
 * Created response helper (201)
 * @param {Object} res - Express response object
 * @param {any} data - Created resource data
 * @param {string} message - Success message
 */
const created = (res, data, message = 'Resource created successfully') => {
  return res.status(201).json({
    success: true,
    message,
    data,
  });
};

/**
 * No content response helper (204)
 * @param {Object} res - Express response object
 */
const noContent = (res) => {
  return res.status(204).send();
};

module.exports = {
  success,
  error,
  paginated,
  created,
  noContent,
};
