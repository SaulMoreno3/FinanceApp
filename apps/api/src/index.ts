import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import loadEnv from "./common/utils/envLoader";
import mainRouter from "./modules/mainRouter";

loadEnv();
const app = express();
// Only the internal proxies and Cloudflare's published ranges may supply client IPs.
// API has no public port; never use trust proxy=true or trust arbitrary leftmost XFF.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', [
    'loopback', 'uniquelocal',
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
    '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22', '2400:cb00::/32',
    '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
    '2a06:98c0::/29', '2c0f:f248::/32',
]);
app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.set('etag', false); // Disable ETags to force 200 OK and preserve CORS headers

// Security Middleware
app.use(helmet());
app.use(cookieParser());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Dashboard screens make multiple API requests per visit
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many requests from this IP, please try again after 15 minutes"
});
app.use(limiter);

// Stricter Rate Limiting for Auth
const authLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 25, // Limit each IP to 25 requests per windowMs
    skip: (req) => req.method === 'OPTIONS',
    message: "Too many login attempts from this IP, please try again after 30 minutes"
});
app.use("/auth/login", authLimiter);
app.use("/auth/register", authLimiter);
app.use("/auth/change-password", authLimiter);
app.use("/auth/profile", authLimiter);

// Middleware
import { errorHandler } from "./common/middleware/errorHandler";
import { requestLogger } from "./common/middleware/requestLogger";
import { trueLayerService } from "./modules/bank-sync/truelayer.service";
import { scheduleMarketDataSync } from "./modules/market-data/market-sync.scheduler";

const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const trustedOrigins = new Set([
    ...(process.env.NODE_ENV === 'production' ? [] : [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4000',
    'tauri://localhost',
    'https://tauri.localhost',
    ]),
    ...configuredOrigins,
]);

app.use(cors({
    origin: (origin, callback) => {
        const isLocalDevelopmentOrigin = process.env.NODE_ENV !== 'production'
            && Boolean(origin?.match(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/));
        if (!origin || trustedOrigins.has(origin) || isLocalDevelopmentOrigin) {
            callback(null, true);
            return;
        }
        callback(Object.assign(new Error('Origin not allowed'), { statusCode: 403 }));
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
}));


app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
        && req.get('Sec-Fetch-Site') === 'cross-site' && !trustedOrigins.has(req.get('Origin') ?? '')) {
        res.status(403).json({ error: 'Cross-site request rejected' }); return;
    }
    next();
});
app.use(express.json({ limit: "2mb" }));
app.use(requestLogger);

// Routes
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/", mainRouter);

app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001; // Fallback to 3001 if env missing
app.listen(PORT, () => console.log(`API on :${PORT}`));

// A daily background sync. The user can also trigger /bank-sync/sync manually.
if (process.env.NODE_ENV === 'production' || process.env.BANK_SYNC_ENABLED === 'true') {
    const runBankSync = () => trueLayerService.syncAllConnections().catch(error => console.error('[bank-sync]', error));
    setTimeout(runBankSync, 30_000);
    setInterval(runBankSync, 24 * 60 * 60 * 1000);
}

if (process.env.NODE_ENV === 'production') {
    scheduleMarketDataSync();
}
