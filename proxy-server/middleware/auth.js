// Authentication middleware - Only allow local connections
import { Request, Response, NextFunction } from 'express';

export function localhostOnly(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress;

  // Allow localhost and 127.0.0.1
  const isLocal =
    clientIp === '127.0.0.1' ||
    clientIp === '::1' ||
    clientIp === '::ffff:127.0.0.1' ||
    clientIp.startsWith('192.168.') || // Allow local network
    clientIp.startsWith('10.') || // Allow private network
    clientIp.startsWith('172.'); // Allow private network

  if (!isLocal) {
    console.warn(`Blocked request from non-local IP: ${clientIp}`);
    return res.status(403).json({
      success: false,
      error: 'Access denied - Only local connections are allowed',
    });
  }

  next();
}
