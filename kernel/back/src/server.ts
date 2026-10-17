// Passenger's configured "Application startup file" — deliberately just
// this one line. All the actual readiness-checking/logging logic lives in
// boot.ts, kept independent of this file so it can never itself be the
// thing that fails silently.
import './boot.js';
