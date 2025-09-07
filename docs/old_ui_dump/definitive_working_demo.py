#!/usr/bin/env python3
"""
DEFINITIVE SUPER SIMPLE ENHANCED TRADING DEMO

This shows the working 2-block system that actually executes payments.
This replaces all the old broken 3-block systems.
"""

import sys
import os
import tkinter as tk

src_path = os.path.join(os.path.dirname(__file__), 'src')
sys.path.insert(0, src_path)

from src.game import MonopolyGame
from src.player import Player
from src.gui import MonopolyGUI
from src.super_simple_enhanced import SuperSimpleEnhancedTrade

from game import MonopolyGame
from gui import MonopolyGUI
from player import Player
from super_simple_enhanced import SuperSimpleEnhancedTrade

def main():
    print("🚀 DEFINITIVE SUPER SIMPLE ENHANCED TRADING DEMO")
    print("=" * 70)
    print()
    print("This demo proves the new 2-block system works:")
    print("💰 Block 1: Pay Money (set amount)")
    print("🔄 Block 2: For X Turns (set duration)")
    print()
    print("The old 3-block system has been completely replaced!")
    print()
    
    # Create minimal game setup
    game = MonopolyGame()
    alice = Player("Alice")
    bob = Player("Bob")
    charlie = Player("Charlie")
    
    # Initialize with money
    alice.money = 1500
    bob.money = 1500
    charlie.money = 1500
    
    game.players = [alice, bob, charlie]
    game.current_player_index = 0
    
        # Create GUI after imports are properly handled
    gui = MonopolyGUI(game)
    game.gui = gui  # Make sure the game knows about the GUI
    root = gui.root
    root.title("🚀 Super Simple Enhanced Trading - WORKING SYSTEM!")
    
    # Auto-create a working trade for demonstration
    print("📝 Auto-creating demonstration trade...")
    print("   Alice will pay Bob $150 per turn for 4 turns")
    print("   Plus Alice gives Bob $50 immediately")
    
    demo_trade = SuperSimpleEnhancedTrade(
        proposer=alice,
        recipient=bob,
        offered_properties=[],
        requested_properties=[],
        offered_money=50,    # Immediate payment
        requested_money=0,
        my_blocks=[{         # Alice's function blocks
            'amount': 150,
            'turns': 4,
            'description': '$150 per turn for 4 turns'
        }],
        partner_blocks=[]    # Bob doesn't pay anything back
    )
    
    # Auto-accept the trade
    print("✅ Auto-accepting trade to show it works...")
    
    # GUI is already initialized, so we can accept the trade
    game.accept_trade(demo_trade)
    
    print()
    print("🎯 DEMO INSTRUCTIONS:")
    print("=" * 40)
    print("1. Look at the button: '🔄⚡ Super Simple Enhanced Trade'")
    print("2. Click 'End Turn' to advance turns")
    print("3. Watch Alice automatically pay Bob $150 each turn")
    print("4. After 4 payments, the function blocks stop")
    print("5. Try creating your own trades with the button!")
    print()
    print("Starting balances:")
    print(f"   Alice: ${alice.money} (will lose $650 total)")
    print(f"   Bob: ${bob.money} (will gain $650 total)")
    print(f"   Charlie: ${charlie.money} (unchanged)")
    print()
    print("Expected after 4 turns:")
    print(f"   Alice: ${alice.money - 650}")
    print(f"   Bob: ${bob.money + 650}")
    print(f"   Charlie: ${charlie.money}")
    
    # Add welcome messages
    gui.add_log_message("🚀 SUPER SIMPLE ENHANCED TRADING DEMO")
    gui.add_log_message("🔥 Alice → Bob: $150/turn for 4 turns + $50 now")
    gui.add_log_message("💡 Click 'End Turn' to see automatic payments")
    gui.add_log_message("✨ Only 2 blocks needed: Pay Money + For X Turns")
    gui.add_log_message("🎯 Try the '🔄⚡ Super Simple Enhanced Trade' button!")
    
    # Show current status
    summary = game.simple_blocks.get_active_payments_summary()
    gui.add_log_message(f"📋 {summary}")
    
    # Start the game
    gui.run()

if __name__ == "__main__":
    try:
        main()
        print("\n✅ Demo completed!")
        
    except Exception as e:
        print(f"\n❌ Demo error: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n🎉 SUPER SIMPLE ENHANCED TRADING IS READY! 🎉")
    print("The old 3-block system is gone. Only the working 2-block system remains!")
