# AeonovX Team Database
# File: team_members.py
# Edit this file to add/remove team members

# Team member database - Both name and password must match exactly
AEONOVX_TEAM = {
    "Sharjan": {"password": "i1234", "role": "Financial Analyst"},
    "Naveen": {"password": "i1234", "role": "AI Dveloper"}, 
    "Stephen": {"password": "i1234", "role": "Backend Developer"},
    "Albert": {"password": "i1234", "role": "Frontend Developer"},
    "Akhiljith": {"password": "i1234", "role": "UI designer"},
    # "David Brown": {"password": "david456", "role": "DevOps Engineer"},
    # "Lisa Park": {"password": "lisa123", "role": "QA Engineer"},
    # "Admin": {"password": "admin2024", "role": "Administrator"}
}

# # Custom welcome messages per team member
# USER_WELCOMES = {
#     "Naveen": "Welcome Naveen!",
#     "Sharjan": "Hi Sarju!",
#     "Stephen": "Hey ste!",
#     "Albert": "Welcome Albert! ",
#     "Akhiljith": "Hi Akhil! ",
#     # "David Brown": "Hey David! Deployment guides, server configs, or infrastructure docs? 🔧",
#     # "Lisa Park": "Welcome Lisa! Testing procedures, bug reports, or quality standards? 🧪",
#     # "Admin": "Welcome Admin! Full system access and team analytics available."
# }

# Helper functions for team management
def add_team_member(name, password, role="Team Member"):
    """Add new team member to the database"""
    AEONOVX_TEAM[name] = {"password": password, "role": role}
    USER_WELCOMES[name] = f"Welcome {name}! Great to have you on the AeonovX team! 🚀"
    print(f"✅ Added {name} ({role}) to AeonovX team")
    print("⚠️ Remember to redeploy to Railway for changes to take effect!")

def remove_team_member(name):
    """Remove team member from the database"""
    if name in AEONOVX_TEAM:
        del AEONOVX_TEAM[name]
        if name in USER_WELCOMES:
            del USER_WELCOMES[name]
        print(f"❌ Removed {name} from AeonovX team")
        print("⚠️ Remember to redeploy to Railway for changes to take effect!")
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

def update_password(name, new_password):
    """Update team member password"""
    if name in AEONOVX_TEAM:
        AEONOVX_TEAM[name]["password"] = new_password
        print(f"🔑 Updated password for {name}")
        print("⚠️ Remember to redeploy to Railway for changes to take effect!")
    else:
        print(f"⚠️ {name} not found in team database")

def update_role(name, new_role):
    """Update team member role"""
    if name in AEONOVX_TEAM:
        AEONOVX_TEAM[name]["role"] = new_role
        print(f"👔 Updated role for {name} to {new_role}")
        print("⚠️ Remember to redeploy to Railway for changes to take effect!")
    else:
        print(f"⚠️ {name} not found in team database")

# Quick add functions for common scenarios
def add_freelancer(name, password):
    """Quick add freelancer with temporary access"""
    add_team_member(name, password, "Freelancer")

def add_intern(name, password):
    """Quick add intern with limited access"""
    add_team_member(name, password, "Intern")

def add_client_contact(name, password):
    """Quick add client contact with view access"""
    add_team_member(name, password, "Client Contact")

# Usage examples:
if __name__ == "__main__":
    print("AeonovX Team Management System")
    print("=" * 40)
    
    # Display current team
    list_team_members()
    
    print("\n📝 Usage Examples:")
    print("add_team_member('New Person', 'newpass123', 'Developer')")
    print("remove_team_member('Old Person')")
    print("update_password('John Smith', 'newpassword')")
    print("add_freelancer('Freelancer Name', 'temppass')")
    
    print("\n⚠️ After any changes, redeploy to Railway for updates to take effect!")