# Centralized transaction action groups.
# Add any new action here — it will automatically apply everywhere
# (realized gains, unrealized gains, lot assignments, holdings, etc.)

BUY_ACTIONS = {"BUY", "REI", "EXTERNAL_ASSET_TRANSFER_IN"}
SELL_ACTIONS = {"SELL"}
OPTION_EXPIRY_ACTIONS = {"OPTIONEXPIRATION"}
OPTION_EXERCISE_ACTIONS = {"OPTIONEXERCISE"}
TRANSFER_OUT_ACTIONS = {"TRANSFER"}  # shares leaving brokerage — close lots silently, no gain recorded
