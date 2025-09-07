#!/usr/bin/env python3
"""
Monopoly Board Display Test - Shows the responsive board layout
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

import tkinter as tk
from src.gui import MonopolyGUI
from src.player import Player
from src.board import get_property_by_position

class BoardDisplayTest:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Monopoly Board - Responsive Display Test")
        
        # Get screen dimensions
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        
        # Set window to 85% of screen size
        window_width = int(screen_width * 0.85)
        window_height = int(screen_height * 0.85)
        
        # Center window
        x = (screen_width - window_width) // 2
        y = (screen_height - window_height) // 2
        
        self.root.geometry(f"{window_width}x{window_height}+{x}+{y}")
        self.root.configure(bg='#2c3e50')
        
        # Create a mock game object
        self.create_demo_game()
        
        # Create GUI
        self.gui = MockMonopolyGUI(self)
        
        # Add demo text
        demo_frame = tk.Frame(self.root, bg='#2c3e50')
        demo_frame.pack(side=tk.TOP, fill=tk.X, padx=10, pady=5)
        
        demo_label = tk.Label(demo_frame, 
                             text="🎯 Responsive Monopoly Board Demo - Resize window to see scaling in action!",
                             bg='#2c3e50', fg='#ecf0f1', font=('Arial', 12, 'bold'))
        demo_label.pack()
        
        info_label = tk.Label(demo_frame,
                             text="✓ Board auto-scales to fit screen ✓ All 40 spaces visible ✓ Player tokens scale ✓ Industry-standard responsive design",
                             bg='#2c3e50', fg='#95a5a6', font=('Arial', 9))
        info_label.pack()
        
    def create_demo_game(self):
        """Create demo players for testing"""
        self.players = [
            Player("Player 1"),
            Player("Player 2"), 
            Player("Player 3"),
            Player("Player 4")
        ]
        
        # Position players at different corners for demo
        self.players[0].position = 0   # GO
        self.players[1].position = 10  # Jail
        self.players[2].position = 20  # Free Parking
        self.players[3].position = 30  # Go to Jail
        
        self.current_player_index = 0
    
    def get_current_player(self):
        return self.players[self.current_player_index]
    
    def run(self):
        self.root.mainloop()

class MockMonopolyGUI(MonopolyGUI):
    """Mock GUI that only shows the board for testing"""
    
    def __init__(self, game_controller):
        self.game = game_controller
        self.root = game_controller.root
        
        # Initialize colors and other attributes
        self.colors = {
            'bg': '#2c3e50',
            'card_bg': '#34495e', 
            'accent': '#3498db',
            'success': '#27ae60',
            'warning': '#f39c12',
            'danger': '#e74c3c',
            'text': '#ecf0f1',
            'text_dark': '#2c3e50'
        }
        
        self.player_colors = ['#e74c3c', '#3498db', '#f39c12', '#27ae60']
        
        self.setup_styles()
        self.create_board_only()
        
    def create_board_only(self):
        """Create only the board for testing"""
        # Main frame for board
        self.board_frame = tk.Frame(self.root, bg=self.colors['card_bg'])
        self.board_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(50, 10))
        
        self.create_board(self.board_frame)
        
        # Initial display
        self.update_player_positions(self.game.players)
        
        # Add resize instructions
        instructions = tk.Label(self.root,
                              text="Try resizing this window to see the responsive board scaling!",
                              bg='#2c3e50', fg='#f39c12', font=('Arial', 10))
        instructions.pack(side=tk.BOTTOM, pady=5)

if __name__ == "__main__":
    print("🏠 Starting Monopoly Board Display Test...")
    print("This will show you how the board scales responsively to different screen sizes.")
    print("Try resizing the window to see the adaptive layout in action!")
    print("\nPress Ctrl+C to exit the demo.\n")
    
    try:
        demo = BoardDisplayTest()
        demo.run()
    except KeyboardInterrupt:
        print("\nDemo ended. Thanks for testing! 👋")
    except Exception as e:
        print(f"Error running demo: {e}")
        print("Make sure tkinter is installed: sudo apt-get install python3-tk")
