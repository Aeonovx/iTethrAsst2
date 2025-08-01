# File: tools.py
# Description: Defines the tools (functions) that the Gemini model can call.

import logging
from datetime import datetime
import pytz # A library for handling timezones

logger = logging.getLogger(__name__)

# --- Tool Implementations ---
# Each function here is a "tool" the bot can use.

def get_current_time(timezone: str = "Europe/Riga") -> str:
    """
    Gets the current time in a specified timezone.
    
    Args:
        timezone: The timezone to get the current time for, e.g., 'Europe/Riga'.
    
    Returns:
        The current time as a formatted string.
    """
    try:
        tz = pytz.timezone(timezone)
        current_time = datetime.now(tz)
        return f"The current time in {timezone} is {current_time.strftime('%A, %B %d, %Y at %I:%M %p')}."
    except pytz.UnknownTimeZoneError:
        logger.warning(f"Unknown timezone requested: {timezone}")
        return f"Sorry, I don't recognize the timezone '{timezone}'."
    except Exception as e:
        logger.error(f"Error getting time: {e}")
        return "Sorry, I encountered an error while trying to get the time."

# --- Tool Configuration for Gemini API ---

def get_tools_config() -> dict:
    """
    Returns the complete tool configuration schema for the Gemini API.
    This tells the model what functions are available, what they do, and what parameters they need.
    """
    return {
        "functionDeclarations": [
            {
                "name": "get_current_time",
                "description": "Returns the current date and time for a given timezone.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "timezone": {
                            "type": "STRING",
                            "description": "The IANA timezone name, e.g., 'Europe/Riga', 'America/New_York'."
                        }
                    },
                    "required": ["timezone"]
                }
            },
            # Add declarations for new tools here in the future
        ]
    }

# --- Tool Execution Dispatcher ---

# A mapping of tool names to their actual Python functions
AVAILABLE_TOOLS = {
    "get_current_time": get_current_time,
}

def execute_tool(name: str, args: dict) -> any:
    """
    Executes a tool by its name with the given arguments.
    
    Args:
        name: The name of the function to call (e.g., "get_current_time").
        args: A dictionary of arguments for the function.
        
    Returns:
        The result of the tool's execution.
    """
    if name in AVAILABLE_TOOLS:
        function_to_call = AVAILABLE_TOOLS[name]
        try:
            # The **args syntax unpacks the dictionary into keyword arguments
            return function_to_call(**args)
        except Exception as e:
            logger.error(f"Error executing tool '{name}' with args {args}: {e}")
            return f"Error: Could not execute the tool '{name}'."
    else:
        return f"Error: Tool '{name}' not found."

