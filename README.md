# StacksBoard 📌

Collaborative sticky notes for teams - built with PocketBase and vanilla JavaScript.

**Powered by [STACKS Hosting](https://stackshosting.cloud) - $2/month infrastructure**

## Features

- ⚡ Real-time sync across all users
- 👥 Up to 10 users per board
- 🔒 Optional password protection
- 🎨 Multiple note colors
- 📱 Mobile friendly
- 🚀 No login required

## Architecture

- **Frontend**: Static HTML/CSS/JS served by Nginx ($1/month)
- **Backend**: PocketBase for API, realtime, and database ($1/month)
- **Total cost**: $2/month

```
Browser → Nginx (static files + proxy)
              ↓
         PocketBase (API + realtime + DB)
```

## Deploy Your Own

### On STACKS Hosting

1. Create a **PocketBase Micro** container ($1/month)
2. Create an **Nginx Micro** container ($1/month)
3. Set up PocketBase collections (see below)
4. Deploy this repo to Nginx via GitHub webhook
5. Configure Nginx to proxy `/api/` to PocketBase

### PocketBase Collections

**boards**
| Field | Type |
|-------|------|
| name | Plain text |
| password | Plain text |
| user_count | Number (default: 0) |

API Rules: All empty (public access)

**notes**
| Field | Type |
|-------|------|
| board_id | Plain text |
| text | Plain text |
| color | Plain text |
| x | Number |
| y | Number |

API Rules: All empty (public access)

## Local Development

```bash
# Serve frontend
npx serve frontend/

# Run PocketBase locally
./pocketbase serve
```

## License

MIT - Do whatever you want with it!

## Credits

Built by [STACKS Hosting](https://stackshosting.cloud) to demonstrate what you can build for $2/month.
