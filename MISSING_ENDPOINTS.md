# 🔧 Missing REST API Endpoints - Implementation Needed

## Status: ENDPOINTS NOT IMPLEMENTED

The following REST API endpoints are referenced by the frontend but **do not exist** in `server/main.py`:

---

## Missing Endpoints List

### 1. Profile Stats
```python
@app.get("/profile/stats")
async def get_profile_stats(request: Request):
    """
    Get user statistics (games played, wins, achievements, etc.)
    
    Returns:
        {
            "games_played": int,
            "games_won": int,
            "total_cash_earned": int,
            "properties_owned": int,
            "trades_completed": int,
            "achievements": List[str],
            ...
        }
    """
    # TODO: Implement
    pass
```

### 2. Coin Balance
```python
@app.get("/coins/balance")
async def get_coin_balance(request: Request):
    """
    Get user's current coin balance
    
    Returns:
        {"balance": int, "currency": "coins"}
    """
    # TODO: Implement
    pass
```

### 3. Premium Ownership Check
```python
@app.get("/coins/premium-ownership")
async def check_premium_ownership(request: Request):
    """
    Check if user owns premium token/features
    
    Returns:
        {
            "owns_premium": bool,
            "premium_features": List[str],
            "expires_at": Optional[str]
        }
    """
    # TODO: Implement
    pass
```

### 4. Friends List
```python
@app.get("/friends")
async def get_friends(request: Request):
    """
    Get user's friends list
    
    Returns:
        {
            "accepted": List[FriendObject],
            "pending_in": List[FriendRequest],
            "pending_out": List[FriendRequest]
        }
    """
    # TODO: Implement
    pass
```

### 5. Logout
```python
@app.post("/auth/logout")
async def logout(request: Request, response: Response):
    """
    Log out user and clear session
    
    Returns:
        {"ok": true}
    """
    # TODO: Implement
    # Clear session_id cookie
    # Remove session from SESSIONS dict
    pass
```

---

## Implementation Notes

### Session Access Pattern
All these endpoints need to:
1. Extract `session_id` from cookies
2. Look up session in `SESSIONS` dict
3. Get user data from session
4. Return user-specific data

**Example pattern:**
```python
@app.get("/profile/stats")
async def get_profile_stats(request: Request):
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in SESSIONS:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    
    session = SESSIONS[session_id]
    user_profile = session.get("user")
    user_id = user_profile.get("id")
    
    # Fetch or compute stats for user_id
    stats = get_user_stats(user_id)  # Implement this
    
    return JSONResponse(stats)
```

### Data Storage Needed

Currently, the server uses in-memory storage. These endpoints will need:

1. **User stats tracking**
   - Create `USER_STATS = {}` dictionary
   - Update stats during gameplay
   - Persist to database eventually

2. **Coin balances**
   - Create `USER_COINS = {}` dictionary
   - Track purchases and spending
   - Integrate with Stripe webhooks

3. **Premium ownership**
   - Create `PREMIUM_USERS = set()` or dict
   - Mark users who purchased premium
   - Check during gameplay for premium features

4. **Friends system**
   - Create `USER_FRIENDS = {}` dictionary
   - Track friend requests and acceptances
   - Implement friend_request, accept_friend, reject_friend endpoints

---

## Recommended Implementation Order

### Phase 1: Authentication (HIGH PRIORITY)
1. **`/auth/logout`** - Critical for user flow
   - Clear session cookie
   - Remove from SESSIONS dict
   - Return success

### Phase 2: Profile & Coins (HIGH PRIORITY)
2. **`/coins/balance`** - Needed for coin store UI
   - Return balance from USER_COINS
   - Default to 0 for new users

3. **`/coins/premium-ownership`** - Needed for premium features
   - Check PREMIUM_USERS set
   - Return boolean + features list

4. **`/profile/stats`** - Needed for profile page
   - Return stats from USER_STATS
   - Compute defaults for new users

### Phase 3: Social Features (MEDIUM PRIORITY)
5. **`/friends`** - Social features
   - Implement full friends system
   - Add friend request endpoints

---

## Quick Fix Implementation

Here's a minimal working implementation to unblock testing:

```python
# Add to server/main.py

# Storage
USER_STATS = {}  # user_id -> stats dict
USER_COINS = {}  # user_id -> balance (int)
PREMIUM_USERS = set()  # set of user_ids with premium
USER_FRIENDS = {}  # user_id -> {accepted: [], pending_in: [], pending_out: []}

def get_session_user(request: Request):
    """Helper to get user from session"""
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in SESSIONS:
        return None
    session = SESSIONS[session_id]
    return session.get("user")

@app.get("/profile/stats")
async def get_profile_stats(request: Request):
    user = get_session_user(request)
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    
    user_id = user.get("id")
    stats = USER_STATS.get(user_id, {
        "games_played": 0,
        "games_won": 0,
        "total_cash_earned": 0,
        "properties_owned": 0,
        "trades_completed": 0,
        "achievements": user.get("achievements", [])
    })
    return JSONResponse(stats)

@app.get("/coins/balance")
async def get_coin_balance(request: Request):
    user = get_session_user(request)
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    
    user_id = user.get("id")
    balance = USER_COINS.get(user_id, 0)
    return JSONResponse({"balance": balance, "currency": "coins"})

@app.get("/coins/premium-ownership")
async def check_premium_ownership(request: Request):
    user = get_session_user(request)
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    
    user_id = user.get("id")
    owns_premium = user_id in PREMIUM_USERS
    return JSONResponse({
        "owns_premium": owns_premium,
        "premium_features": ["premium-token", "advanced-stats"] if owns_premium else []
    })

@app.get("/friends")
async def get_friends(request: Request):
    user = get_session_user(request)
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    
    user_id = user.get("id")
    friends = USER_FRIENDS.get(user_id, {
        "accepted": [],
        "pending_in": [],
        "pending_out": []
    })
    return JSONResponse(friends)

@app.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_id = request.cookies.get("session_id")
    if session_id and session_id in SESSIONS:
        del SESSIONS[session_id]
    
    response.delete_cookie("session_id")
    return JSONResponse({"ok": True})
```

---

## Testing After Implementation

Once implemented, test with:

```bash
# Register and login first to get session cookie
curl -c cookies.txt -X POST http://127.0.0.1:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"Test123!","display_name":"Test"}'

# Then test each endpoint
curl -b cookies.txt http://127.0.0.1:8000/profile/stats
curl -b cookies.txt http://127.0.0.1:8000/coins/balance
curl -b cookies.txt http://127.0.0.1:8000/coins/premium-ownership
curl -b cookies.txt http://127.0.0.1:8000/friends
curl -b cookies.txt -X POST http://127.0.0.1:8000/auth/logout
```

---

## Estimated Implementation Time

- **Quick fix (minimal):** 30 minutes
- **Full implementation with proper storage:** 2-3 hours
- **With database persistence:** 4-6 hours
- **Full friends system:** +2-3 hours

---

## Priority

**HIGH** - These endpoints are called by the frontend and currently cause 404 errors, degrading user experience.

**Action:** Implement the "Quick Fix" version ASAP to unblock frontend functionality, then enhance with proper persistence later.

