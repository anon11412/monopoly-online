#!/usr/bin/env python3
"""
FULL INTEGRATION TEST - Enhanced Trading with Function Blocks

This test will run the actual Enhanced Trading system with function blocks
and prove that payments happen in the real game.
"""

import sys
import os
import tkinter as tk

# Add src to path
src_path = os.path.join(os.path.dirname(__file__), 'src')
sys.path.insert(0, src_path)

from game import MonopolyGame
from player import Player
from enhanced_trading_new import EnhancedTrade

def test_enhanced_trading_integration():
    print("🚀 ENHANCED TRADING INTEGRATION TEST")
    print("=" * 50)
    
    # Create a minimal root for tkinter (required for messagebox)
    root = tk.Tk()
    root.withdraw()  # Hide the window
    
    # Create game
    game = MonopolyGame()
    
    # Create players
    alice = Player("Alice", "red")
    alice.money = 2000
    
    bob = Player("Bob", "blue")
    bob.money = 500
    
    game.players = [alice, bob]
    game.current_player_index = 0
    
    # Create a minimal GUI object for logging
    class MockGUI:
        def add_log_message(self, message):
            print(f"📢 LOG: {message}")
        
        def update_player_display(self, players, current_index):
            pass  # No-op for testing
    
    game.gui = MockGUI()
    
    print(f"✅ Game setup - Alice: ${alice.money}, Bob: ${bob.money}")
    
    # Create Enhanced Trade with function blocks
    offered_blocks = [
        {
            'id': 1,
            'name': 'Every Turn',
            'icon': '🔄',
            'type': 'trigger',
            'variables': {}
        },
        {
            'id': 2,
            'name': 'For X Turns', 
            'icon': '⏱️',
            'type': 'condition',
            'variables': {'turns': 3}  # 3 turns for faster test
        },
        {
            'id': 3,
            'name': 'Pay Money',
            'icon': '💰',
            'type': 'action',
            'variables': {'amount': 300}  # $300 per turn
        }
    ]
    
    # Create Enhanced Trade
    trade = EnhancedTrade(
        proposer=alice,
        recipient=bob,
        offered_properties=[],
        requested_properties=[],
        offered_money=0,
        requested_money=0,
        offered_blocks=offered_blocks,
        requested_blocks=[]
    )
    
    print(f"📝 Enhanced Trade: Alice pays Bob $300/turn for 3 turns")
    print()
    
    # Accept the trade using the game's system
    print("✅ Accepting Enhanced Trade through game system...")
    game.accept_trade(trade)
    
    print()
    print("🎮 EXECUTING TURNS")
    print("=" * 30)
    
    # Execute turns and verify payments
    total_payments = 0
    
    for turn in range(1, 6):  # Test 5 turns (expect 3 payments)
        print(f"\n🎯 TURN {turn}")
        print("-" * 15)
        
        current_player = game.get_current_player()
        print(f"Current player: {current_player.name}")
        
        alice_before = alice.money
        bob_before = bob.money
        
        print(f"Before: Alice=${alice_before}, Bob=${bob_before}")
        
        # This is the actual game turn logic - function blocks execute here
        game.function_block_executor.execute_blocks_for_player(current_player)
        
        alice_after = alice.money
        bob_after = bob.money
        
        payment = alice_before - alice_after
        received = bob_after - bob_before
        
        print(f"After:  Alice=${alice_after}, Bob=${bob_after}")
        
        if payment > 0:
            print(f"💰 PAYMENT EXECUTED: ${payment}")
            total_payments += payment
        else:
            print("⭕ No payment this turn")
        
        # Show active blocks
        active_count = len(game.function_block_executor.active_blocks)
        print(f"📋 Active function blocks: {active_count}")
        
        # Switch to next player
        game.current_player_index = (game.current_player_index + 1) % len(game.players)
    
    print()
    print("📊 FINAL VERIFICATION")
    print("=" * 30)
    
    expected_total = 3 * 300  # 3 turns × $300
    alice_expected_final = 2000 - expected_total
    bob_expected_final = 500 + expected_total
    
    print(f"Total payments made: ${total_payments}")
    print(f"Expected total: ${expected_total}")
    print(f"Alice final: ${alice.money} (expected: ${alice_expected_final})")
    print(f"Bob final: ${bob.money} (expected: ${bob_expected_final})")
    
    # Test success
    success = (
        total_payments == expected_total and
        alice.money == alice_expected_final and
        bob.money == bob_expected_final
    )
    
    # Clean up
    root.destroy()
    
    return success

if __name__ == "__main__":
    try:
        success = test_enhanced_trading_integration()
        
        if success:
            print("\n🎉 ENHANCED TRADING INTEGRATION TEST PASSED! 🎉")
            print("✅ Function blocks are working in the real game!")
        else:
            print("\n❌ INTEGRATION TEST FAILED")
            print("The function blocks are not executing properly in the game")
            
    except Exception as e:
        print(f"\n💀 TEST ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    input("\nPress Enter to exit...")
