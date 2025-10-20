# Changelog

All notable changes to the AstraSync API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-20

### 🎉 Production Release

This marks the official production release of the AstraSync API!

### Changed
- **BREAKING**: Migrated from Railway developer preview environment to production infrastructure
- API base URL: Now deployed at production endpoints (previously `https://astrasync-api-production.up.railway.app`)
- Updated API version from 0.1.0 to 1.0.0
- Updated all documentation from "Developer Preview" to "Production"
- Trust score format: Removed "TEMP-" prefix (now "95%" instead of "TEMP-95%")
- Response messaging: Updated to reflect production status
- Dashboard URL: Changed from `https://preview.astrasync.ai` to `https://astrasync.ai`

### Improved
- Production-grade infrastructure with improved reliability
- Enhanced API documentation
- Cleaner trust score presentation
- Updated messaging for agent registration and verification

### Migration Guide

If you're using the API from the developer preview:

1. **Update your API endpoint:**
   - Old: `https://astrasync-api-production.up.railway.app/v1/register`
   - New: Use your deployed production endpoint

2. **Trust scores:**
   - Trust scores no longer include "TEMP-" prefix
   - Scores now display as clean percentages (e.g., "95%")

3. **Agent IDs:**
   - Temporary agent IDs (TEMP-XXXXXXX) continue to work
   - Create an account to convert to permanent credentials

4. **No code changes required** - All endpoints remain backward compatible

### Note
- Blockchain integration remains in progress and will be fully enabled in a future release
- All existing functionality continues to work as expected
- Customer intelligence and registration attempt logging fully operational

---

## [0.1.0] - 2025-09-XX

### Developer Preview Release
- Initial public release
- Agent registration with temporary IDs
- Email notifications
- Customer intelligence logging
- Railway development infrastructure
