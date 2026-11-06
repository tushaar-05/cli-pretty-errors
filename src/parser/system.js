/**
 * Extracts and normalizes Node.js system error metadata (errno, code, syscall, path, dest, address, port).
 */

const SYSTEM_ERROR_CODES = new Set([
  'E2BIG', 'EACCES', 'EADDRINUSE', 'EADDRNOTAVAIL', 'EAFNOSUPPORT',
  'EAGAIN', 'EALREADY', 'EBADF', 'EBADMSG', 'EBUSY', 'ECANCELED',
  'ECHILD', 'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EDEADLK',
  'EDESTADDRREQ', 'EDOM', 'EDQUOT', 'EEXIST', 'EFAULT', 'EFBIG',
  'EHOSTUNREACH', 'EIDRM', 'EILSEQ', 'EINPROGRESS', 'EINTR', 'EINVAL',
  'EIO', 'EISCONN', 'EISDIR', 'ELOOP', 'EMFILE', 'EMLINK', 'EMSGSIZE',
  'ENAMETOOLONG', 'ENETDOWN', 'ENETRESET', 'ENETUNREACH', 'ENFILE',
  'ENOBUFS', 'ENODATA', 'ENODEV', 'ENOENT', 'ENOEXEC', 'ENOLCK',
  'ENOLINK', 'ENOMEM', 'ENOMSG', 'ENOPROTOOPT', 'ENOSPC', 'ENOSR',
  'ENOSTR', 'ENOSYS', 'ENOTCONN', 'ENOTDIR', 'ENOTEMPTY', 'ENOTSOCK',
  'ENOTSUP', 'ENOTTY', 'ENXIO', 'EOPNOTSUPP', 'EOVERFLOW', 'EPERM',
  'EPIPE', 'EPROTO', 'EPROTONOSUPPORT', 'EPROTOTYPE', 'ERANGE', 'EROFS',
  'ESPIPE', 'ESRCH', 'ESTALE', 'ETIME', 'ETIMEDOUT', 'ETXTBSY',
  'EWOULDBLOCK', 'EXDEV'
]);

/**
 * Checks if a given value exhibits the traits of a Node.js system error.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isSystemError(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }

  const hasSyscall = typeof err.syscall === 'string' && err.syscall.length > 0;
  const hasKnownCode = typeof err.code === 'string' && SYSTEM_ERROR_CODES.has(err.code);
  const hasErrno = err.errno !== undefined && err.errno !== null;

  return hasSyscall || (hasKnownCode && hasErrno) || (hasKnownCode && (err.path !== undefined || err.address !== undefined));
}

/**
 * Safely extracts system error properties without mutating the input.
 *
 * @param {object} err
 * @returns {{ syscall: string|null, path: string|null, dest: string|null, errno: number|string|null, code: string|null, address: string|null, port: number|null }}
 */
export function extractSystemInfo(err) {
  if (!err || typeof err !== 'object') {
    return null;
  }

  const syscall = typeof err.syscall === 'string' ? err.syscall : null;
  const path = typeof err.path === 'string' ? err.path : null;
  const dest = typeof err.dest === 'string' ? err.dest : null;
  const errno = (typeof err.errno === 'number' || typeof err.errno === 'string') ? err.errno : null;
  const code = typeof err.code === 'string' ? err.code : null;
  const address = typeof err.address === 'string' ? err.address : null;
  const port = typeof err.port === 'number' ? err.port : null;

  const hasAnyInfo = syscall !== null || path !== null || dest !== null || errno !== null || code !== null || address !== null || port !== null;

  if (!hasAnyInfo) {
    return null;
  }

  return {
    syscall,
    path,
    dest,
    errno,
    code,
    address,
    port
  };
}
