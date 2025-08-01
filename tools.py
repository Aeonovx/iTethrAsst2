# File: tools.py
# Description: Defines the tools (functions) that the AI model can call.
# [FIX] Updated to use the OpenAI-compatible tool format for Groq.

import logging
from datetime import datetime
import pytz
import json

logger = logging.getLogger(__name__)

# --- Tool Implementations ---

def get_current_time(timezone: str = "Europe/Riga") -> str:
    """
    Gets the current time in a specified timezone.
    If no timezone is provided, it defaults to Riga, Latvia.
    """
    try:
        # Use a default if the provided timezone is empty or None
        tz_str = timezone if timezone else "Europe/Riga"
        tz = pytz.timezone(tz_str)
        current_time = datetime.now(tz)
        return f"The current time in {tz_str} is {current_time.strftime('%A, %B %d, %Y at %I:%M %p')}."
    except pytz.UnknownTimeZoneError:
        logger.warning(f"Unknown timezone requested: {timezone}")
        return f"Sorry, I don't recognize the timezone '{timezone}'."
    except Exception as e:
        logger.error(f"Error getting time: {e}")
        return "Sorry, I encountered an error while trying to get the time."

# --- [FIX] Tool Configuration for Groq API (OpenAI format) ---

def get_tools_config() -> dict:
    """
    Returns the complete tool configuration schema in OpenAI format for the Groq API.
    """
    return {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "Returns the current date and time for a given timezone. Defaults to Riga, Latvia if no timezone is specified.",
            "parameters": {
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": "The IANA timezone name, e.g., 'Europe/Riga', 'America/New_York'."
                    }
                },
                "required": [] # No longer required, as we have a default.
            }
        }
    }

# --- Tool Execution Dispatcher ---

AVAILABLE_TOOLS = {
    "get_current_time": get_current_time,
}

def execute_tool(name: str, args: str) -> any:
    """
    Executes a tool by its name with the given arguments.
    
    Args:
        name: The name of the function to call (e.g., "get_current_time").
        args: A JSON string of arguments for the function.
        
    Returns:
        The result of the tool's execution.
    """
    if name in AVAILABLE_TOOLS:
        function_to_call = AVAILABLE_TOOLS[name]
        try:
            # The model provides arguments as a JSON string.
            arguments = json.loads(args)
            return function_to_call(**arguments)
        except Exception as e:
            logger.error(f"Error executing tool '{name}' with args {args}: {e}")
            return f"Error: Could not execute the tool '{name}'."
    else:
        return f"Error: Tool '{name}' not found."