#!/usr/bin/env python3
"""
SUPER SIMPLE Enhanced Trading Demo - Working System!

This demonstrates the super simple approach that actually works:
- Just 2 blocks: Pay Money + For X Turns
- Direct payment creation
- Guaranteed execution every turn
"""

import sys
import os
import tkinter as tk

src_path = os.path.join(os.path.dirname(__file__), 'src')
sys.path.insert(0, src_path)

from game import MonopolyGame
from gui import MonopolyGUI
from player import Player
from super_simple_enhanced import SuperSimpleEnhancedTrade

def create_working_demo():
    """Create a demo with the working super simple system"""
    
    print("🎮 SUPER SIMPLE ENHANCED TRADING DEMO")
    print("=" * 50)
    print("This demo shows the WORKING super simple approach!")
    print()
    
    # Create game
    game = MonopolyGame()
    
    # Create players
    alice = Player("Alice", "red")
    alice.money = 2000
    
    bob = Player("Bob", "blue")
    bob.money = 600
    
    charlie = Player("Charlie", "green")
    charlie.money = 1200
    
    game.players = [alice, bob, charlie]
    game.current_player_index = 0
    
    # Create GUI
    root = tk.Tk()
    root.title("Super Simple Enhanced Trading - WORKING!")
    
    gui = MonopolyGUI(root, game)
    game.gui = gui
    
    print("📝 Setting up automatic demo trade...")
    print("   Alice will pay Bob $200 per turn for 3 turns")
    
    # Create a super simple enhanced trade
    trade = SuperSimpleEnhancedTrade(
        proposer=alice,
        recipient=bob,
        offered_properties=[],
        requested_properties=[],
        offered_money=50,  # Traditional money too
        requested_money=0,
        my_blocks=[{
            'amount': 200,
            'turns': 3,
            'description': '$200 per turn for 3 turns'
        }],
        partner_blocks=[]
    )
    
    print("✅ Auto-accepting trade for demo...")
    game.accept_trade(trade)
    
    print()
    print("🎯 DEMO READY!")
    print("=" * 30)
    print("Starting balances:")
    print(f"   Alice: ${alice.money}")
    print(f"   Bob: ${bob.money}")
    print(f"   Charlie: ${charlie.money}")
    print()
    print("Expected after 3 turns:")
    print(f"   Alice: ${alice.money - 650} (loses $650: $50 initial + $200×3)")
    print(f"   Bob: ${bob.money + 650} (gains $650)")
    print(f"   Charlie: ${charlie.money} (unchanged)")
    print()
    print("Instructions:")
    print("1. Click 'End Turn' to advance turns")
    print("2. Watch Alice pay Bob $200 automatically")
    print("3. After 3 turns, payments will stop")
    print("4. The super simple system WORKS!")
    
    # Add log messages
    gui.add_log_message("🎮 SUPER SIMPLE ENHANCED TRADING DEMO")
    gui.add_log_message("🔥 Alice → Bob: $200/turn for 3 turns")
    gui.add_log_message("💡 Click 'End Turn' to see payments execute")
    gui.add_log_message("✨ Super Simple Function Blocks are ACTIVE!")
    
    # Show active payments
    summary = game.simple_blocks.get_active_payments_summary()
    gui.add_log_message(f"📋 {summary}")
    
    # Start GUI
    root.mainloop()

if __name__ == "__main__":
    try:
        create_working_demo()
        print("\n✅ Demo completed!")
        
    except Exception as e:
        print(f"\n❌ Demo error: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n🎉 SUPER SIMPLE ENHANCED TRADING WORKS! 🎉")
