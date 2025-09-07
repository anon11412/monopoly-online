#!/usr/bin/env python3
"""Test combined trading function blocks execution"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.game import MonopolyGame
from src.player import Player
from src.gui import MonopolyGUI
from src.trading import Trade
import tkinter as tk

def test_combined_trading_blocks():
    print("🎯 TESTING COMBINED TRADING FUNCTION BLOCKS")
    
    # Create test trade with function blocks
    alice = Player('Alice')
    bob = Player('Bob')
    alice.money = 1500
    bob.money = 1500
    
    trade = Trade(alice, bob, [], [], 50, 0)
    trade.function_blocks = [
        {'name': 'Pay Money', 'value': 100, 'default': 100},
        {'name': 'For X Turns', 'value': 3, 'default': 20},
        {'name': 'Every Turn', 'default': None}
    ]
    
    # Setup game
    game = MonopolyGame()
    charlie = Player('Charlie')
    charlie.money = 1500
    game.players = [alice, bob, charlie]
    game.current_player_index = 0
    
    # Create minimal GUI
    root = tk.Tk()
    root.withdraw()
    gui = MonopolyGUI(game)
    game.gui = gui
    
    print(f'Initial: Alice=${alice.money}, Bob=${bob.money}')
    
    # Accept trade
    print('🚀 Accepting trade...')
    game.accept_trade(trade)
    print(f'After trade: Alice=${alice.money}, Bob=${bob.money} (should include immediate $50)')
    
    # Simulate turns
    for turn in range(4):
        current = game.get_current_player()
        print(f'Turn {turn+1}: {current.name} starts - Alice=${alice.money}, Bob=${bob.money}')
        game.dice_rolled = True
        game.end_turn()
        print(f'   After turn: Alice=${alice.money}, Bob=${bob.money}')
    
    print(f'Final: Alice=${alice.money}, Bob=${bob.money}')
    expected_alice = 1500 - 50 - (100 * 3)
    expected_bob = 1500 + 50 + (100 * 3)
    print(f'Expected: Alice=${expected_alice}, Bob=${expected_bob}')
    success = alice.money == expected_alice and bob.money == expected_bob
    print('✅ SUCCESS!' if success else '❌ FAILED!')
    return success

if __name__ == "__main__":
    test_combined_trading_blocks()
