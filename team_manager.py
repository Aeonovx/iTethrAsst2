# File: team_manager.py
# Description: Manages the AeonovX team database and authentication logic.

# Team member database - Both name and password must match exactly
AEONOVX_TEAM = {
    "Sharjan": {"password": "i1234", "role": "Financial Analyst"},
    "Naveen": {"password": "i1234", "role": "AI Dveloper"}, 
    "Stephen": {"password": "i1234", "role": "Backend Developer"},
    "Albert": {"password": "i1234", "role": "Frontend Developer"},
    "Akhiljith": {"password": "i1234", "role": "UI designer"},
}

# --- [FIX] Added the missing authenticate_user function ---
def authenticate_user(name, password):
    """
    Authenticates a user against the AEONOVX_TEAM database.
    Returns the user's data if successful, otherwise returns None.
    """
    user = AEONOVX_TEAM.get(name)
    if user and user["password"] == password:
        return user
    return None
# -----------------------------------------------------------


# --- Existing Helper functions for team management ---
def add_team_member(name, password, role="Team Member"):
    """Add new team member to the database"""
    AEONOVX_TEAM[name] = {"password": password, "role": role}
    print(f"✅ Added {name} ({role}) to AeonovX team")

def remove_team_member(name):
    """Remove team member from the database"""
    if name in AEONOVX_TEAM:
        del AEONOVX_TEAM[name]
        print(f"❌ Removed {name} from AeonovX team")
    else:
        print(f"⚠️ {name} not found in team database")

def list_team_members():
    """Display all active team members"""
    print("📋 Active AeonovX Team Members:")
    print("-" * 50)
    for name, info in AEONOVX_TEAM.items():
        print(f"👤 {name:<20} | {info['role']:<20} | Password: {info['password']}")
    print("-" * 50)
    print(f"Total team members: {len(AEONOVX_TEAM)}")

# (The rest of your helper functions like update_password, update_role, etc. remain here)
def update_password(name, new_password):
    """Update team member password"""
    if name in AEONOVX_TEAM:
        AEONOVX_TEAM[name]["password"] = new_password
        print(f"🔑 Updated password for {name}")
    else:
        print(f"⚠️ {name} not found in team database")

def update_role(name, new_role):
    """Update team member role"""
    if name in AEONOVX_TEAM:
        AEONOVX_TEAM[name]["role"] = new_role
        print(f"👔 Updated role for {name} to {new_role}")
    else:
        print(f"⚠️ {name} not found in team database")