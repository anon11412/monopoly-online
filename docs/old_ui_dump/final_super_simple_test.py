#!/usr/bin/env python3
"""
FINAL SUPER SIMPLE TEST - Complete Integration

This tests the complete working system:
1. Game integration
2. Trade acceptance 
3. Function block execution
4. Payment processing
"""

import sys
import os
import tkinter as tk

src_path = os.path.join(os.path.dirname(__file__), 'src')
sys.path.insert(0, src_path)

from game import MonopolyGame
from player import Player
from super_simple_enhanced import SuperSimpleEnhancedTrade

def test_complete_integration():
    print("🚀 FINAL SUPER SIMPLE INTEGRATION TEST")
    print("=" * 50)
    
    # Create minimal GUI for testing
    root = tk.Tk()
    root.withdraw()  # Hide window
    
    # Create game
    game = MonopolyGame()
    
    # Create players
    alice = Player("Alice", "red")
    alice.money = 1500
    
    bob = Player("Bob", "blue")
    bob.money = 800
    
    game.players = [alice, bob]
    game.current_player_index = 0
    
    # Create minimal GUI mock
    class MockGUI:
        def add_log_message(self, message):
            print(f"🔔 LOG: {message}")
        
        def update_player_display(self, players, current_index):
            pass  # No-op for testing
    
    game.gui = MockGUI()
    
    print(f"✅ Game setup - Alice: ${alice.money}, Bob: ${bob.money}")
    
    # Create Super Simple Enhanced Trade
    print("📝 Creating Super Simple Enhanced Trade...")
    
    trade = SuperSimpleEnhancedTrade(
        proposer=alice,
        recipient=bob,
        offered_properties=[],
        requested_properties=[],
        offered_money=100,  # Alice gives Bob $100 immediately
        requested_money=0,
        my_blocks=[{  # Alice will pay Bob $250 per turn for 3 turns
            'amount': 250,
            'turns': 3,
            'description': '$250 per turn for 3 turns'
        }],
        partner_blocks=[]  # Bob doesn't pay anything
    )
    
    print(f"   Trade summary:")
    print(f"   • Alice gives Bob $100 immediately")
    print(f"   • Alice pays Bob $250 per turn for 3 turns")
    print(f"   • Total: Alice loses $850, Bob gains $850")
    print()
    
    # Accept the trade
    print("✅ Accepting trade through game system...")
    game.accept_trade(trade)
    
    print()
    print("🎮 EXECUTING TURN SEQUENCE")
    print("=" * 40)
    
    # Track totals
    alice_original_start = 1500  # What Alice started with before any trades
    bob_original_start = 800     # What Bob started with before any trades
    total_function_payments = 0
    
    # Execute 5 turns (expect 3 payments)
    for turn in range(1, 6):
        print(f"\n🎯 TURN {turn}")
        print("-" * 20)
        
        current_player = game.get_current_player()
        print(f"Current player: {current_player.name}")
        
        # Record balances
        alice_before = alice.money
        bob_before = bob.money
        
        print(f"Before: Alice=${alice_before}, Bob=${bob_before}")
        
        # Execute function blocks (this is what happens in end_turn)
        game.simple_blocks.execute_payments_for_player(current_player)
        
        alice_after = alice.money
        bob_after = bob.money
        
        payment = alice_before - alice_after
        received = bob_after - bob_before
        
        print(f"After:  Alice=${alice_after}, Bob=${bob_after}")
        
        if payment > 0:
            print(f"💰 FUNCTION BLOCK PAYMENT: ${payment}")
            total_function_payments += payment
        else:
            print("⭕ No function block payment")
        
        # Show remaining payments
        active_count = len(game.simple_blocks.active_payments)
        print(f"📋 Active function blocks: {active_count}")
        
        # Switch to next player
        game.current_player_index = (game.current_player_index + 1) % len(game.players)
    
    print()
    print("📊 FINAL VERIFICATION")
    print("=" * 40)
    
    alice_total_loss = alice_original_start - alice.money
    bob_total_gain = bob.money - bob_original_start
    
    print(f"Alice: ${alice_original_start} → ${alice.money} (lost ${alice_total_loss})")
    print(f"Bob: ${bob_original_start} → ${bob.money} (gained ${bob_total_gain})")
    print(f"Function block payments: ${total_function_payments}")
    print(f"Traditional trade payment: $100")
    print(f"Expected total transfer: $850 (100 + 3×250)")
    
    # Verify success
    expected_total_transfer = 850  # $100 traditional + 3×$250 function blocks
    expected_function_payments = 750  # 3×$250
    
    success = (
        alice_total_loss == expected_total_transfer and
        bob_total_gain == expected_total_transfer and
        total_function_payments == expected_function_payments
    )
    
    # Clean up
    root.destroy()
    
    return success

if __name__ == "__main__":
    try:
        success = test_complete_integration()
        
        if success:
            print("\n🎉 COMPLETE INTEGRATION TEST PASSED! 🎉")
            print("✅ Super Simple Enhanced Trading works perfectly!")
            print("✅ Function blocks execute automatically!")
            print("✅ Payments happen exactly as expected!")
            print("✅ System is ready for use!")
        else:
            print("\n❌ INTEGRATION TEST FAILED")
            print("Something went wrong with the payment system")
            
    except Exception as e:
        print(f"\n💀 TEST ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    input("\nPress Enter to exit...")
