#!/usr/bin/env python3
"""
Monopoly Game Launcher with Feature Overview
"""

import sys
import os

def show_features():
    """Display game features"""
    print("🏠 MONOPOLY GAME - FEATURES 🏠")
    print("=" * 50)
    print()
    print("🎯 CORE FEATURES:")
    print("  ✓ Full 40-space Monopoly board")
    print("  ✓ 4 Players (1 Human + 3 AI Bots)")
    print("  ✓ Complete property system with rent collection")
    print("  ✓ Chance and Community Chest cards")
    print("  ✓ Jail mechanics and special spaces")
    print("  ✓ Property trading system")
    print("  ✓ Save/Load game functionality")
    print()
    print("🤖 AI BOT PERSONALITIES:")
    print("  • Alice (Aggressive) - Buys often, takes risks")
    print("  • Bob (Conservative) - Careful with money, low risk")
    print("  • Charlie (Monopoly Hunter) - Focuses on completing sets")
    print()
    print("🎮 CONTROLS:")
    print("  • Roll Dice - Move your player")
    print("  • Buy Property - Purchase available properties")
    print("  • Trade Properties - Negotiate with other players")
    print("  • End Turn - Pass to next player")
    print("  • Save/Load - Preserve your game progress")
    print()
    print("💡 HOW TO PLAY:")
    print("  1. Roll dice to move around the board")
    print("  2. Buy properties when you land on them")
    print("  3. Collect rent from other players")
    print("  4. Trade properties to complete monopolies")
    print("  5. Be the last player standing to win!")
    print()
    print("🖥️  TECHNICAL INFO:")
    print("  • Built with Python 3 + tkinter")
    print("  • Modern GUI with visual board")
    print("  • Cross-platform compatible")
    print("  • Full game state persistence")
    print()

def main():
    """Main launcher function"""
    show_features()
    
    try:
        choice = input("Press ENTER to start the game, or 'q' to quit: ").strip().lower()
        if choice == 'q':
            print("Thanks for checking out Monopoly! 👋")
            return
        
        print("\n🚀 Starting Monopoly Game...")
        print("Note: The game window will open in a separate GUI window.")
        print("If you're running this in a headless environment, the GUI may not display.")
        print("\nFor testing game logic without GUI, run: python3 test_game.py")
        print()
        
        # Import and start the game
        sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))
        from src.game import MonopolyGame
        
        game = MonopolyGame()
        game.run()
        
    except KeyboardInterrupt:
        print("\n\nGame interrupted. Thanks for playing! 👋")
    except ImportError as e:
        print(f"\n❌ Error: Missing required module - {e}")
        print("If you're missing tkinter, try: sudo apt-get install python3-tk")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        print("Try running the command-line test: python3 test_game.py")

if __name__ == "__main__":
    main()
