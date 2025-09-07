"""
Modern GUI interface for Monopoly game using tkinter
"""

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import math
import time
from board import BOARD_POSITIONS, BOARD_PROPERTIES, get_property_by_position, COLOR_GROUPS

class MonopolyGUI:
    def __init__(self, *args):
        """GUI can be constructed as MonopolyGUI(game) or MonopolyGUI(root, game)."""
        if len(args) == 1:
            game_controller = args[0]
            root = None
        elif len(args) == 2:
            root, game_controller = args
        else:
            raise TypeError("MonopolyGUI expects (game) or (root, game)")

        self.game = game_controller
        self.root = root if root is not None else tk.Tk()
        self.root.title("Monopoly Game")
        # Log state
        self.log_window = None
        self.log_text = None
        # Buffer entries as list of dicts: {text: str, click: None|{type, data}}
        self._log_buffer = []
        # Get screen dimensions
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        # Calculate optimal window size (90% of screen, maintaining aspect ratio)
        max_width = int(screen_width * 0.9)
        max_height = int(screen_height * 0.9)
        # Set minimum dimensions
        min_width = 1000
        min_height = 700
        # Choose final dimensions
        window_width = max(min_width, min(max_width, 1400))
        window_height = max(min_height, min(max_height, 900))
        # Center window on screen
        x = (screen_width - window_width) // 2
        y = (screen_height - window_height) // 2
        self.root.geometry(f"{window_width}x{window_height}+{x}+{y}")
        self.root.configure(bg='#2c3e50')
        # Make window resizable and handle resize events
        self.root.resizable(True, True)
        self.root.minsize(min_width, min_height)
        # Modern color scheme
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
        # Player colors
        self.player_colors = ['#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6', '#ff7043', '#ec407a', '#26c6da']
        self.setup_styles()
        self.create_widgets()
        self.player_tokens = {}
        # Warm up UI components in the background to avoid first-click lag
        try:
            self.root.after(150, self._warmup_ui)
        except Exception:
            pass
        
    # Note: legacy Super Simple Enhanced Trading preload removed
        
    def setup_styles(self):
        """Setup modern ttk styles with current player highlighting"""
        style = ttk.Style()
        style.theme_use('clam')
        
        # Configure base styles
        style.configure('Modern.TFrame', background=self.colors['card_bg'])
        style.configure('Modern.TLabel', background=self.colors['card_bg'], 
                       foreground=self.colors['text'], font=('Arial', 10))
        style.configure('Title.TLabel', background=self.colors['card_bg'], 
                       foreground=self.colors['text'], font=('Arial', 14, 'bold'))
        style.configure('Modern.TButton', font=('Arial', 10))
        
        # Configure current player highlighting styles with enhanced visibility
        style.configure('Current.TFrame', background='#e74c3c', relief='raised', borderwidth=3)
        style.configure('CurrentPlayer.TLabel', background='#e74c3c', 
                       foreground='white', font=('Arial', 12, 'bold'))
        style.configure('CurrentPlayerStat.TLabel', background='#f39c12', 
                       foreground='white', font=('Arial', 10, 'bold'))
        
        # Add a pulsing effect style for super prominent current player
        style.configure('ActivePlayer.TFrame', background='#27ae60', relief='raised', borderwidth=4)
        
    def create_widgets(self):
        """Create main GUI layout"""
        # Main container with proper weight configuration
        main_frame = ttk.Frame(self.root, style='Modern.TFrame')
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Configure grid weights for responsive layout
        main_frame.grid_columnconfigure(0, weight=3)  # Board gets more space
        main_frame.grid_columnconfigure(1, weight=1)  # Control panel gets less space
        main_frame.grid_rowconfigure(0, weight=1)
        
        # Left panel - Game board (responsive)
        self.board_frame = ttk.Frame(main_frame, style='Modern.TFrame')
        self.board_frame.grid(row=0, column=0, sticky='nsew', padx=(0, 10))
        
        # Right panel - Game info and controls (fixed width but responsive height)
        right_panel = ttk.Frame(main_frame, style='Modern.TFrame')
        right_panel.grid(row=0, column=1, sticky='nsew')
        
        # TEMPORARILY DISABLED - Bottom-right panel - Trades (fixed width, below right panel)
        # trades_panel = ttk.Frame(main_frame, style='Modern.TFrame', width=300, height=250)
        # trades_panel.grid(row=1, column=1, sticky='sew', pady=(10, 0))
        # trades_panel.grid_propagate(False)  # Maintain fixed size
        
        # Configure main grid weights
        main_frame.grid_rowconfigure(0, weight=1)  # Main content row
        # main_frame.grid_rowconfigure(1, weight=0)  # Trades panel row
        
        # Bind resize event
        self.root.bind('<Configure>', self.on_window_resize)
        
        self.create_board(self.board_frame)
        self.create_control_panel(right_panel)
        self.create_players_and_log_section(right_panel)
        # self.create_trades_panel(trades_panel)
        
    def create_board(self, parent):
        """Create the game board visualization with center action buttons"""
        # Make board frame responsive
        parent.grid_rowconfigure(0, weight=1)
        parent.grid_columnconfigure(0, weight=1)
        
        # Create container for board and center controls
        board_container = ttk.Frame(parent)
        board_container.grid(row=0, column=0, sticky='nsew', padx=5, pady=5)
        board_container.grid_rowconfigure(0, weight=1)
        board_container.grid_columnconfigure(0, weight=1)
        
        # Board canvas with responsive sizing
        self.board_canvas = tk.Canvas(board_container, bg=self.colors['card_bg'], highlightthickness=0)
        self.board_canvas.grid(row=0, column=0, sticky='nsew')
        
        # Initial board size calculation
        self.calculate_board_size()
        
        # Draw board
        self.draw_board_spaces()
    
    def calculate_board_size(self):
        """Calculate optimal board size based on available space"""
        # Update canvas to get current size
        self.root.update_idletasks()
        
        # Get available space
        canvas_width = self.board_canvas.winfo_width()
        canvas_height = self.board_canvas.winfo_height()
        
        # Use minimum dimension to ensure square board fits
        if canvas_width < 100 or canvas_height < 100:  # Initial sizing
            available_size = 600
        else:
            available_size = min(canvas_width, canvas_height) - 40  # Leave 20px margin on each side
        
        # Ensure minimum size
        self.board_size = max(400, available_size)
        
        # Calculate space dimensions (board has 11x11 grid - 10 spaces per side + corners)
        self.space_size = self.board_size // 11
        
        # Board offset to center it
        self.board_offset_x = 20
        self.board_offset_y = 20
        
        # Update canvas size
        total_size = self.board_size + 40
        self.board_canvas.configure(width=total_size, height=total_size)
    
    def on_window_resize(self, event):
        """Handle window resize events"""
        # Only respond to root window resize events
        if event.widget == self.root:
            self.root.after_idle(self.redraw_board)
    
    def redraw_board(self):
        """Redraw the board with new sizing"""
        self.calculate_board_size()
        self.board_canvas.delete("all")
        self.draw_board_spaces()
        if hasattr(self, 'game') and hasattr(self.game, 'players'):
            self.update_player_positions(self.game.players)
        
    def draw_board_spaces(self):
        """Draw all board spaces with responsive sizing"""
        # Draw board outline
        board_end = self.board_offset_x + self.board_size
        self.board_canvas.create_rectangle(
            self.board_offset_x, self.board_offset_y, 
            board_end, board_end, 
            outline=self.colors['text'], width=3
        )
        
        for i, space in enumerate(BOARD_PROPERTIES):
            x, y = self.get_board_position_responsive(i)
            
            # Determine space color based on property group
            if hasattr(space, 'color_group'):
                color = self.get_property_color(space.color_group)
            else:
                color = '#95a5a6'  # Gray for special spaces
            
            # Draw space rectangle
            space_rect = self.board_canvas.create_rectangle(
                x, y, x + self.space_size, y + self.space_size,
                fill=color, outline=self.colors['text'], width=1
            )
            
            # Add space text with improved readability
            text_x = x + self.space_size // 2
            text_y = y + self.space_size // 2
            
            # Calculate font size based on space size (smaller for better fit)
            font_size = max(6, min(9, self.space_size // 8))
            
            # More generous text truncation - allow longer names
            if self.space_size < 60:
                max_chars = 10
            elif self.space_size < 80:
                max_chars = 14
            else:
                max_chars = 18
            
            # No truncation - use smaller font instead
            display_name = space.name
            
            # Determine text color based on background for better contrast
            if color in ['#8B4513', '#FF0000', '#008000', '#000080', '#2c3e50']:  # Dark backgrounds
                text_color = 'white'
            else:  # Light backgrounds
                text_color = '#2c3e50'
            
            # Create text element with better styling
            space_text = self.board_canvas.create_text(
                text_x, text_y, text=display_name,
                fill=text_color, font=('Arial', font_size, 'bold'),
                width=self.space_size - 8, anchor='center'
            )
            
            # Create invisible clickable overlay for better click detection
            click_overlay = self.board_canvas.create_rectangle(
                x, y, x + self.space_size, y + self.space_size,
                fill='', outline='', width=0
            )

            # Bind click only on the overlay to avoid duplicate dialogs
            click_handler = lambda e, pos=i: self.on_space_click(pos)
            self.board_canvas.tag_bind(click_overlay, '<Button-1>', click_handler)

            # Add tags for easier management (no extra click binds)
            space_tag = f"space_{i}"
            self.board_canvas.itemconfig(space_rect, tags=(space_tag,))
            self.board_canvas.itemconfig(space_text, tags=(space_tag,))
            self.board_canvas.itemconfig(click_overlay, tags=(space_tag,))

            # Ownership indicator: thick colored bar on side closest to board center
            if hasattr(space, 'owner') and space.owner is not None:
                try:
                    owner_index = self.game.players.index(space.owner)
                except Exception:
                    owner_index = 0
                owner_color = self.player_colors[owner_index % len(self.player_colors)]
                bar_thickness = max(6, self.space_size // 6)

                # Determine side group based on position index
                if i <= 10:  # bottom row (inner side is top)
                    self.board_canvas.create_rectangle(
                        x + 1, y + 1, x + self.space_size - 1, y + 1 + bar_thickness,
                        fill=owner_color, outline=owner_color
                    )
                elif i <= 20:  # left side (inner side is right)
                    self.board_canvas.create_rectangle(
                        x + self.space_size - 1 - bar_thickness, y + 1, x + self.space_size - 1, y + self.space_size - 1,
                        fill=owner_color, outline=owner_color
                    )
                elif i <= 30:  # top row (inner side is bottom)
                    self.board_canvas.create_rectangle(
                        x + 1, y + self.space_size - 1 - bar_thickness, x + self.space_size - 1, y + self.space_size - 1,
                        fill=owner_color, outline=owner_color
                    )
                else:  # right side (inner side is left)
                    self.board_canvas.create_rectangle(
                        x + 1, y + 1, x + 1 + bar_thickness, y + self.space_size - 1,
                        fill=owner_color, outline=owner_color
                    )

            # Mortgaged badge: small red 'M' in corner
            if hasattr(space, 'mortgaged') and space.mortgaged:
                badge_size = max(10, self.space_size // 5)
                self.board_canvas.create_rectangle(
                    x + self.space_size - badge_size - 2, y + self.space_size - badge_size - 2,
                    x + self.space_size - 2, y + self.space_size - 2,
                    fill='#c0392b', outline='white', width=1
                )
                self.board_canvas.create_text(
                    x + self.space_size - badge_size // 2 - 2, y + self.space_size - badge_size // 2 - 2,
                    text='M', fill='white', font=('Arial', max(8, badge_size // 2), 'bold')
                )
    
    def get_board_position_responsive(self, position):
        """Calculate responsive GUI position for board space"""
        if position <= 10:  # Bottom row (right to left)
            x = self.board_offset_x + self.board_size - ((position + 1) * self.space_size)
            y = self.board_offset_y + self.board_size - self.space_size
        elif position <= 20:  # Left side (bottom to top)
            x = self.board_offset_x
            y = self.board_offset_y + self.board_size - ((position - 10 + 1) * self.space_size)
        elif position <= 30:  # Top row (left to right)
            x = self.board_offset_x + ((position - 20) * self.space_size)
            y = self.board_offset_y
        else:  # Right side (top to bottom)
            x = self.board_offset_x + self.board_size - self.space_size
            y = self.board_offset_y + ((position - 30) * self.space_size)
        
        return x, y
    
    def get_property_color(self, color_group):
        """Get color for property group"""
        color_map = {
            'brown': '#8b4513',
            'light_blue': '#87ceeb',
            'pink': '#ffc0cb',
            'orange': '#ffa500',
            'red': '#ff0000',
            'yellow': '#ffff00',
            'green': '#008000',
            'dark_blue': '#000080',
            'railroad': '#2c3e50',
            'utility': '#95a5a6'
        }
        return color_map.get(color_group, '#95a5a6')
    
    def create_control_panel(self, parent):
        """Create game control panel with responsive layout"""
        # Configure parent grid
        parent.grid_rowconfigure(0, weight=0)  # Title
        parent.grid_rowconfigure(1, weight=0)  # Current player
        parent.grid_rowconfigure(2, weight=0)  # Controls
        parent.grid_rowconfigure(3, weight=0)  # Dice
        # Give players row expand weight and a reasonable minimum height to ensure visibility
        parent.grid_rowconfigure(4, weight=1, minsize=180)  # Players (expandable)
        parent.grid_rowconfigure(5, weight=0)  # Log
        parent.grid_columnconfigure(0, weight=1)

        # Title
        title_label = ttk.Label(parent, text="Monopoly Game", style='Title.TLabel')
        title_label.grid(row=0, column=0, pady=(0, 10), sticky='ew')

        # Current player info
        self.current_player_frame = ttk.Frame(parent, style='Modern.TFrame')
        self.current_player_frame.grid(row=1, column=0, sticky='ew', pady=(0, 10))

        self.current_player_label = ttk.Label(self.current_player_frame,
                                              text="Current Player:", style='Modern.TLabel')
        self.current_player_label.pack()

        # Game controls - Action buttons
        controls_frame = ttk.Frame(parent, style='Modern.TFrame')
        controls_frame.grid(row=2, column=0, sticky='ew', pady=(0, 10))
        controls_frame.grid_columnconfigure(0, weight=1)

        self.roll_dice_btn = ttk.Button(controls_frame, text="🎲 Roll Dice",
                                         command=self.roll_dice, style='Modern.TButton')
        self.roll_dice_btn.grid(row=0, column=0, sticky='ew', pady=1)

        self.buy_property_btn = ttk.Button(controls_frame, text="💰 Buy Property",
                                           command=self.buy_property, style='Modern.TButton')
        self.buy_property_btn.grid(row=1, column=0, sticky='ew', pady=1)

        self.end_turn_btn = ttk.Button(controls_frame, text="✅ End Turn",
                                        command=self.end_turn, style='Modern.TButton')
        self.end_turn_btn.grid(row=2, column=0, sticky='ew', pady=1)

        # Trade buttons - Keep traditional trading separate from enhanced
        self.trade_btn = ttk.Button(controls_frame, text="🔄 Trade Properties",
                                    command=self.open_trade_dialog, style='Modern.TButton')
        self.trade_btn.grid(row=3, column=0, sticky='ew', pady=1)

        # Advanced combined trading (beta) - checkbox-based functions + traditional
        self.advanced_trade_btn = ttk.Button(controls_frame,
                                             text="🔄 Advanced Combined Trade (beta)",
                                             command=self.open_combined_trading_dialog,
                                             style='Modern.TButton')
        self.advanced_trade_btn.grid(row=4, column=0, sticky='ew', pady=1)

        # Declare Bankruptcy button
        self.bankrupt_btn = ttk.Button(controls_frame,
                                       text="⚠️ Declare Bankruptcy",
                                       command=lambda: self.handle_bankruptcy(self.game.get_current_player()),
                                       style='Modern.TButton')
        self.bankrupt_btn.grid(row=5, column=0, sticky='ew', pady=1)

        # Save/Load buttons in a sub-grid
        save_load_frame = ttk.Frame(controls_frame)
        save_load_frame.grid(row=6, column=0, sticky='ew', pady=1)
        save_load_frame.grid_columnconfigure(0, weight=1)
        save_load_frame.grid_columnconfigure(1, weight=1)

        self.save_btn = ttk.Button(save_load_frame, text="Save",
                                   command=self.save_game, style='Modern.TButton')
        self.save_btn.grid(row=0, column=0, sticky='ew', padx=(0, 2))

        self.load_btn = ttk.Button(save_load_frame, text="Load",
                                   command=self.load_game, style='Modern.TButton')
        self.load_btn.grid(row=0, column=1, sticky='ew', padx=(2, 0))

        # Bind hover-based warmups for heavy actions created in this panel
        self._init_hover_warmups()

        # Dice display
        dice_frame = ttk.Frame(parent, style='Modern.TFrame')
        dice_frame.grid(row=3, column=0, sticky='ew', pady=(0, 10))

        ttk.Label(dice_frame, text="Last Roll:", style='Modern.TLabel').pack()
        self.dice_label = ttk.Label(dice_frame, text="🎲 🎲",
                                    style='Title.TLabel', font=('Arial', 18))
        self.dice_label.pack()

        # Vote-kick controls under dice
        self.vote_kick_status = ttk.Label(dice_frame, text="", style='Modern.TLabel')
        self.vote_kick_status.pack(pady=(6, 0))
        self.vote_kick_btn = ttk.Button(dice_frame,
                                        text="Vote Kick Current Player",
                                        style='Modern.TButton',
                                        command=self.vote_kick_current_player)
        self.vote_kick_btn.pack(pady=(2, 0))
    
    def update_action_buttons(self):
        """Update state of action buttons based on game state"""
        if not hasattr(self.game, 'get_current_player'):
            return
        
        current_player = self.game.get_current_player()
        if not current_player:
            return
        
        # Check if buttons exist
        if not (hasattr(self, 'roll_dice_btn') and hasattr(self, 'buy_property_btn') and hasattr(self, 'end_turn_btn')):
            return
        
        # Update button states for all players (no hiding for bots now)
        dice_rolled = getattr(self.game, 'dice_rolled', False)
        current_space = get_property_by_position(current_player.position)
        
        # Roll Dice button - enabled only if dice not rolled
        if not dice_rolled:
            self.roll_dice_btn.configure(state='normal')
        else:
            self.roll_dice_btn.configure(state='disabled')
        
        # Buy Property button - enabled if on an unowned property with enough money
        can_buy = (
            hasattr(current_space, 'price') and
            getattr(current_space, 'is_special', False) is False and
            current_space.owner is None and
            current_player.money >= current_space.price
        )
        
        if can_buy:
            self.buy_property_btn.configure(state='normal')
            self.buy_property_btn.configure(text=f"💰 Buy {current_space.name} (${current_space.price})")
        else:
            self.buy_property_btn.configure(state='disabled')
            self.buy_property_btn.configure(text="💰 Buy Property")
        
        # End Turn button - enabled only after dice rolled
        if dice_rolled:
            self.end_turn_btn.configure(state='normal')
        else:
            self.end_turn_btn.configure(state='disabled')

        # Bankruptcy button state
        if hasattr(self, 'bankrupt_btn'):
            if current_player.bankrupt:
                self.bankrupt_btn.configure(state='disabled')
            else:
                self.bankrupt_btn.configure(state='normal')
    
    def cast_vote_kick(self, voter):
        """Cast a vote to kick the current dice holder on behalf of the given voter."""
        try:
            if hasattr(self.game, 'cast_vote_kick'):
                self.game.cast_vote_kick(voter)
        finally:
            self.update_vote_kick_display()

    def vote_kick_current_player(self):
        """Trigger a vote to kick the current player using the first available human voter (not current)."""
        if not hasattr(self.game, 'players'):
            return
        current = self.game.get_current_player()
        # Pick first non-bankrupt human that isn't current
        voter = None
        for p in self.game.players:
            if p is current:
                continue
            if getattr(p, 'bankrupt', False):
                continue
            if not getattr(p, 'is_bot', False):
                voter = p
                break
        # If no human, allow first bot voter to facilitate testing
        if voter is None:
            for p in self.game.players:
                if p is current or getattr(p, 'bankrupt', False):
                    continue
                voter = p
                break
        if voter:
            self.cast_vote_kick(voter)

    def _update_vote_kick_button_state(self):
        btn = getattr(self, 'vote_kick_btn', None)
        if not btn or not hasattr(self.game, 'players'):
            return
        current = self.game.get_current_player()
        # Disable if only one active player or game over
        active = [p for p in self.game.players if not getattr(p, 'bankrupt', False)]
        disable = (len(active) <= 1) or getattr(self.game, 'game_over', False)
        btn.configure(state='disabled' if disable else 'normal')

    def update_vote_kick_display(self):
        """Update the vote-kick status label under the dice."""
        label = getattr(self, 'vote_kick_status', None)
        if not label:
            return
        state = getattr(self.game, 'vote_kick', None)
        current = self.game.get_current_player() if hasattr(self.game, 'get_current_player') else None
        if not state or not current or state.get('target') != current:
            label.config(text="")
            self._update_vote_kick_button_state()
            return
        voters = state.get('voters', set())
        required = state.get('required', 0)
        remaining = max(0, int(state.get('expires_at', 0) - time.time()))
        mm = remaining // 60
        ss = remaining % 60
        label.config(text=f"Vote Kick: {len(voters)}/{required} • {mm:02d}:{ss:02d}")
        self._update_vote_kick_button_state()

    def _bind_warm_hover(self, widget, key, action):
        """Bind a one-time hover to perform a warm-up action.
        key prevents repeating the warm-up multiple times.
        """
        if not hasattr(self, '_did_warmups'):
            self._did_warmups = set()

        def _on_enter(_e=None):
            if key in self._did_warmups:
                return
            try:
                action()
            except Exception:
                pass
            self._did_warmups.add(key)
        try:
            widget.bind('<Enter>', _on_enter, add='+')
        except Exception:
            pass

    def _init_hover_warmups(self):
        """Bind warm-up hovers for heavy UI actions/buttons."""
        # Trade dialogs
        self._bind_warm_hover(self.trade_btn, 'trading', lambda: __import__('trading'))
        self._bind_warm_hover(self.advanced_trade_btn, 'combined_trading', lambda: __import__('combined_trading'))
        # Save/load tend to touch filesystem — no preload needed
        try:
            # Save/Load modules
            self._bind_warm_hover(self.save_btn, 'save_load', lambda: __import__('save_load'))
            self._bind_warm_hover(self.load_btn, 'save_load', lambda: __import__('save_load'))
        except Exception:
            pass
        # Lightweight no-ops to prime event loop paths for other buttons
        for btn, key in [
            (getattr(self, 'roll_dice_btn', None), 'roll'),
            (getattr(self, 'buy_property_btn', None), 'buy'),
            (getattr(self, 'end_turn_btn', None), 'end_turn'),
            (getattr(self, 'bankrupt_btn', None), 'bankrupt'),
            (getattr(self, 'vote_kick_btn', None), 'vote_kick'),
        ]:
            if btn is not None:
                try:
                    self._bind_warm_hover(btn, key, lambda: None)
                except Exception:
                    pass
    
    def create_players_and_log_section(self, parent):
        """Create the players, pending trades, and log section"""
        # Players info - non-scroll compact container
        players_container = ttk.Frame(parent, style='Modern.TFrame')
        players_container.grid(row=4, column=0, sticky='nsew', pady=(0, 10))
        players_container.grid_columnconfigure(0, weight=1)
        # Allow the players list row to expand within the container
        players_container.grid_rowconfigure(1, weight=1)

        ttk.Label(players_container, text="Players:", style='Title.TLabel').grid(row=0, column=0, sticky='ew')

        # Area that will be rebuilt to show all players without scrolling
        self.players_frame = ttk.Frame(players_container, style='Modern.TFrame')
        self.players_frame.grid(row=1, column=0, sticky='nsew')
        # Initial populate so the tab isn't empty
        if hasattr(self.game, 'players') and hasattr(self.game, 'current_player_index'):
            try:
                self.update_player_display(self.game.players, self.game.current_player_index)
            except Exception:
                pass

        # Simple Pending Trades section - between players and log
        trades_frame = ttk.Frame(parent, style='Modern.TFrame')
        trades_frame.grid(row=5, column=0, sticky='ew', pady=(5, 0))
        trades_frame.grid_columnconfigure(0, weight=1)

        # Simple trades title and button
        trades_title_frame = ttk.Frame(trades_frame, style='Modern.TFrame')
        trades_title_frame.grid(row=0, column=0, sticky='ew')
        trades_title_frame.grid_columnconfigure(0, weight=1)
        ttk.Label(trades_title_frame, text="Trades:", style='Modern.TLabel').grid(row=0, column=0, sticky='w')
        self.view_trades_btn = ttk.Button(trades_title_frame, text="📬 View Trades",
                                          command=self.open_pending_trades_dialog, style='Modern.TButton')
        self.view_trades_btn.grid(row=0, column=1, sticky='e', padx=(4, 0))
        self.open_log_btn = ttk.Button(trades_title_frame, text="📜 Open Game Log",
                                       command=self.open_log_window, style='Modern.TButton')
        self.open_log_btn.grid(row=0, column=2, sticky='e', padx=(4, 0))
        # Warmup on hover for these too
        self._bind_warm_hover(self.view_trades_btn, 'trades_viewer', lambda: __import__('trades_viewer'))
        self._bind_warm_hover(self.open_log_btn, 'log_window', lambda: self.open_log_window(show=False))
        # Initial render of players overview so it shows immediately
        try:
            if hasattr(self, 'game') and hasattr(self.game, 'players'):
                self.update_player_display(self.game.players, getattr(self.game, 'current_player_index', 0))
        except Exception:
            pass
    
    def create_pending_trades_panel(self, parent):
        """Create the pending trades panel between players and log"""
        # Configure parent row for trades panel
        parent.grid_rowconfigure(5, weight=0)  # Trades panel row
        
        trades_container = ttk.Frame(parent, style='Modern.TFrame')
        trades_container.grid(row=5, column=0, sticky='ew', pady=(0, 10))
        trades_container.grid_rowconfigure(1, weight=1)
        trades_container.grid_columnconfigure(0, weight=1)
        
        # Title with trade button
        title_frame = ttk.Frame(trades_container, style='Modern.TFrame')
        title_frame.grid(row=0, column=0, sticky='ew')
        title_frame.grid_columnconfigure(0, weight=1)
        
        ttk.Label(title_frame, text="Pending Trades:", style='Title.TLabel').grid(row=0, column=0, sticky='w')
        
        # Quick trade button
        ttk.Button(title_frame, text="+ New Trade", 
                  command=self.open_trade_dialog, style='Modern.TButton').grid(row=0, column=1, sticky='e')
        
        # Scrollable trades list
        self.pending_trades_canvas = tk.Canvas(trades_container, bg=self.colors['card_bg'], 
                                              highlightthickness=0, height=120)
        trades_scrollbar = ttk.Scrollbar(trades_container, orient="vertical", 
                                        command=self.pending_trades_canvas.yview)
        self.pending_trades_frame = ttk.Frame(self.pending_trades_canvas, style='Modern.TFrame')
        
        self.pending_trades_frame.bind(
            "<Configure>",
            lambda e: self.pending_trades_canvas.configure(scrollregion=self.pending_trades_canvas.bbox("all"))
        )
        
        self.pending_trades_canvas.create_window((0, 0), window=self.pending_trades_frame, anchor="nw")
        self.pending_trades_canvas.configure(yscrollcommand=trades_scrollbar.set)
        
        self.pending_trades_canvas.grid(row=1, column=0, sticky='nsew')
        trades_scrollbar.grid(row=1, column=1, sticky='ns')
        
        # Initialize trades display
        self.refresh_pending_trades_display()
    
    def refresh_pending_trades_display(self):
        """Refresh the pending trades display"""
        # Check if pending trades frame exists
        if not hasattr(self, 'pending_trades_frame') or self.pending_trades_frame is None:
            return
            
        # Clear existing widgets
        for widget in self.pending_trades_frame.winfo_children():
            widget.destroy()
        
        if not hasattr(self.game, 'get_all_pending_trades'):
            # No trades to show
            ttk.Label(self.pending_trades_frame, text="No pending trades", 
                     style='Modern.TLabel').pack(pady=10)
            return
        
        trades = self.game.get_all_pending_trades()
        current_player = self.game.get_current_player()
        
        if not trades:
            ttk.Label(self.pending_trades_frame, text="No pending trades", 
                     style='Modern.TLabel').pack(pady=10)
            return
        
        # Display trades with color coding
        for i, trade in enumerate(trades):
            self.create_pending_trade_widget(self.pending_trades_frame, trade, current_player, i)
    
    def create_pending_trade_widget(self, parent, trade, current_player, index):
        """Create a widget for a pending trade"""
        # Determine color based on relationship to current player
        if trade.proposer == current_player:
            # Trade from me - blue background
            bg_color = '#3498db'
            text_color = 'white'
            prefix = "→ TO"
        elif trade.recipient == current_player:
            # Trade for me - green background
            bg_color = '#27ae60'
            text_color = 'white'
            prefix = "← FROM"
        else:
            # Trade between others - default background
            bg_color = self.colors['card_bg']
            text_color = self.colors['text']
            prefix = "◦"
        
        # Create trade frame
        trade_frame = tk.Frame(parent, bg=bg_color, relief=tk.RAISED, bd=1)
        trade_frame.pack(fill='x', padx=2, pady=1)
        
        # Trade summary text (compact for panel)
        summary = f"{prefix} {trade.proposer.name} ↔ {trade.recipient.name}"
        
        # Add details on second line
        details = []
        if trade.offered_properties:
            details.append(f"{len(trade.offered_properties)} props")
        if trade.offered_money > 0:
            details.append(f"${trade.offered_money}")
        
        if details:
            summary += f"\n{' + '.join(details)}"
        
        trade_label = tk.Label(trade_frame, text=summary, 
                              bg=bg_color, fg=text_color,
                              font=('Arial', 8), justify=tk.LEFT)
        trade_label.pack(anchor='w', padx=5, pady=2)
        
        # Make clickable for details
        trade_label.bind("<Button-1>", lambda e, t=trade: self.show_trade_details_from_panel(t))
        trade_frame.bind("<Button-1>", lambda e, t=trade: self.show_trade_details_from_panel(t))
    
    def show_trade_details_from_panel(self, trade):
        """Show trade details when clicked from pending trades panel"""
        # Open the global trades dialog
        self.open_global_trades_dialog()
    
    def update_player_display(self, players, current_player_index):
        """Update Players Overview as a compact grid with no scrolling."""
        # Clear existing player widgets
        for widget in self.players_frame.winfo_children():
            try:
                widget.destroy()
            except Exception:
                pass

        # Header
        header = ttk.Label(self.players_frame, text="Players Overview", style='Modern.TLabel', font=('Arial', 12, 'bold'))
        header.grid(row=0, column=0, columnspan=3, sticky='w', pady=(0, 6), padx=(2, 2))

        # Filter out bankrupt players
        players = [p for p in players if not getattr(p, 'bankrupt', False)]
        if not players:
            ttk.Label(self.players_frame, text="No active players", style='Modern.TLabel').grid(row=1, column=0, sticky='w', padx=4)
            return

        # Clamp index and prepare grid
        safe_index = min(max(0, current_player_index), len(players) - 1)
        cols = 2 if len(players) <= 6 else 3

        # Build tiles
        for i, player in enumerate(players):
            r = (i // cols) + 1
            c = i % cols
            is_current = (i == safe_index)

            tile = ttk.Frame(self.players_frame, style='Current.TFrame' if is_current else 'Modern.TFrame', padding=4)
            tile.grid(row=r, column=c, sticky='ew', padx=2, pady=2)
            # Make columns expand evenly
            self.players_frame.grid_columnconfigure(c, weight=1)

            # Dot color
            try:
                idx = self.game.players.index(player)
            except Exception:
                idx = i
            pcolor = self.player_colors[idx % len(self.player_colors)] if hasattr(self, 'player_colors') else '#3498db'

            dot = tk.Canvas(tile, width=14, height=14, highlightthickness=0, bg=self.colors['card_bg'])
            dot.grid(row=0, column=0, sticky='w')
            dot.create_oval(1, 1, 13, 13, fill=pcolor, outline=pcolor)

            name_style = 'CurrentPlayer.TLabel' if is_current else 'Modern.TLabel'
            name = ttk.Label(tile, text=str(getattr(player, 'name', f'Player {i+1}'))[:18], style=name_style)
            name.grid(row=0, column=1, sticky='w', padx=(6, 4))

            cash = ttk.Label(tile, text=f"${getattr(player, 'money', 0)}", style=name_style if is_current else 'Modern.TLabel')
            cash.grid(row=0, column=2, sticky='e', padx=(6, 4))

            props = len(getattr(player, 'properties', []) or [])
            jail_flag = " 🔒" if getattr(player, 'in_jail', False) else ""
            props_lbl = ttk.Label(tile, text=f"{props}🏠{jail_flag}", style=name_style if is_current else 'Modern.TLabel')
            props_lbl.grid(row=0, column=3, sticky='e')

        # Current player header
        current_player = players[safe_index]
        self.current_player_label.config(text=f"🎮 Current Turn: {current_player.name}", font=('Arial', 12, 'bold'))

    # No scroll adjustments needed; the right panel will expand to show all
    
    def create_trades_panel(self, parent):
        """Create the trades panel in bottom-right"""
        # Configure parent
        parent.grid_rowconfigure(1, weight=1)
        parent.grid_columnconfigure(0, weight=1)
        
        # Title
        title_frame = ttk.Frame(parent, style='Modern.TFrame')
        title_frame.grid(row=0, column=0, sticky='ew', pady=(0, 5))
        
        title_label = ttk.Label(title_frame, text="🔄 Trading Center", 
                               style='Title.TLabel', font=('Arial', 12, 'bold'))
        title_label.pack()
        
        # Trade actions
        actions_frame = ttk.Frame(parent, style='Modern.TFrame')
        actions_frame.grid(row=1, column=0, sticky='ew', pady=(0, 5))
        actions_frame.grid_columnconfigure(0, weight=1)
        
        self.trade_btn = ttk.Button(actions_frame, text="💰 New Trade", 
                                   command=self.open_trade_dialog, style='Modern.TButton')
        self.trade_btn.grid(row=0, column=0, sticky='ew', pady=1)
        
        self.my_trades_btn = ttk.Button(actions_frame, text="📬 My Trades", 
                                       command=self.open_pending_trades_dialog, style='Modern.TButton')
        self.my_trades_btn.grid(row=1, column=0, sticky='ew', pady=1)
        
        self.all_trades_btn = ttk.Button(actions_frame, text="🌍 All Trades", 
                                        command=self.open_global_trades_dialog, style='Modern.TButton')
        self.all_trades_btn.grid(row=2, column=0, sticky='ew', pady=1)
        
        # Trades list container with scrolling
        trades_container = ttk.Frame(parent, style='Modern.TFrame')
        trades_container.grid(row=2, column=0, sticky='nsew', pady=(5, 0))
        trades_container.grid_rowconfigure(0, weight=1)
        trades_container.grid_columnconfigure(0, weight=1)
        
        # Create scrollable trades list
        self.trades_canvas = tk.Canvas(trades_container, bg=self.colors['card_bg'], 
                                      highlightthickness=0, height=200)
        trades_scrollbar = ttk.Scrollbar(trades_container, orient="vertical", 
                                        command=self.trades_canvas.yview)
        self.trades_frame = ttk.Frame(self.trades_canvas, style='Modern.TFrame')
        
        self.trades_frame.bind(
            "<Configure>",
            lambda e: self.trades_canvas.configure(scrollregion=self.trades_canvas.bbox("all"))
        )
        
        self.trades_canvas.create_window((0, 0), window=self.trades_frame, anchor="nw")
        self.trades_canvas.configure(yscrollcommand=trades_scrollbar.set)
        
        self.trades_canvas.grid(row=0, column=0, sticky='nsew')
        trades_scrollbar.grid(row=0, column=1, sticky='ns')
        
        # Initialize trades display
        self.refresh_trades_display()
    
    def refresh_trades_display(self):
        """Refresh the trades display with color coding"""
        # Clear existing widgets
        for widget in self.trades_frame.winfo_children():
            widget.destroy()
        
        # Get all pending trades
        try:
            trades = self.game.get_all_pending_trades()
        except:
            trades = []
        
        if not trades:
            no_trades_label = ttk.Label(self.trades_frame,
                                       text="No pending trades\nUse 'Trade Properties' button\nto create new trades",
                                       font=('Arial', 10), justify=tk.CENTER)
            no_trades_label.pack(pady=20)
            return
        
        # Display trades with color coding
        for i, trade in enumerate(trades):
            self.create_trade_widget(self.trades_frame, trade, i)
    
    def create_trade_widget(self, parent, trade, index):
        """Create a colored trade widget"""
        current_player = self.game.get_current_player()
        
        # Determine color based on relationship to current player
        if trade.proposer == current_player:
            # Trade from me - blue background
            bg_color = '#3498db'
            text_color = 'white'
            prefix = "→ TO"
        elif trade.recipient == current_player:
            # Trade for me - green background
            bg_color = '#27ae60'
            text_color = 'white'
            prefix = "← FROM"
        else:
            # Trade between others - default background
            bg_color = self.colors['card_bg']
            text_color = self.colors['text']
            prefix = "◦ OTHER"
        
        # Create trade frame
        trade_frame = tk.Frame(parent, bg=bg_color, relief=tk.RAISED, bd=1)
        trade_frame.pack(fill='x', padx=2, pady=1)
        
        # Trade summary text (shortened for compact display)
        summary = f"{prefix}: {trade.proposer.name} ↔ {trade.recipient.name}"
        
        # Add details on second line
        details = []
        if trade.offered_properties:
            details.append(f"{len(trade.offered_properties)} props")
        if trade.offered_money > 0:
            details.append(f"${trade.offered_money}")
        
        if details:
            summary += f"\n{' + '.join(details)}"
        
        trade_label = tk.Label(trade_frame, text=summary, 
                              bg=bg_color, fg=text_color,
                              font=('Arial', 8), justify=tk.LEFT)
        trade_label.pack(anchor='w', padx=5, pady=2)
        
        # Make clickable for details
        trade_label.bind("<Button-1>", lambda e, t=trade: self.show_trade_quick_details(t))
        trade_frame.bind("<Button-1>", lambda e, t=trade: self.show_trade_quick_details(t))
    
    def show_trade_quick_details(self, trade):
        """Show quick trade details dialog"""
        # Just open the global trades dialog focused on this trade
        self.open_global_trades_dialog()
    
    def update_player_positions(self, players):
        """Update player token positions; larger, single-color tokens without emoji/pulses"""
        # Clear existing tokens
        self.board_canvas.delete("player_token")
        
        # Get current player index from game
        current_player_index = getattr(self.game, 'current_player_index', 0)
        
        # Draw new tokens
        for i, player in enumerate(players):
            if player.bankrupt:
                continue
                
            x, y = self.get_board_position_responsive(player.position)
            
            # Calculate token size based on space size (larger overall)
            base_token_size = max(12, min(22, self.space_size // 5))
            token_size = base_token_size + (4 if i == current_player_index else 0)
            border_width = 3 if i == current_player_index else 2
            
            # Offset multiple players on same space
            offset_x = (i % 2) * (token_size + 2)
            offset_y = (i // 2) * (token_size + 2)
            
            token_x = x + 5 + offset_x
            token_y = y + 5 + offset_y
            
            # Draw player token (single-color oval)
            token = self.board_canvas.create_oval(
                token_x, token_y, token_x + token_size, token_y + token_size,
                fill=self.player_colors[i % len(self.player_colors)],
                outline=self.colors['text'], width=border_width,
                tags="player_token"
            )
            # No emoji or pulsing decorations
    
    def add_log_message(self, message):
        """Add a simple message to the log buffer and window if open."""
        entry = {"text": message, "click": None}
        self._log_buffer.append(entry)
        if self.log_text is not None:
            self._append_log_entry_to_widget(entry)
    
    def add_log_message_with_clickable_trade(self, message):
        """Add log message with clickable 'trade' word"""
        # Find the word "trade" in the message (case insensitive)
        message_lower = message.lower()
        trade_start = message_lower.find("trade")
        
        if trade_start == -1:
            # No "trade" word found, add normally
            self.log_text.insert(tk.END, message + "\n")
            self.log_text.see(tk.END)
            return
        
        # Insert message parts
        start_index = self.log_text.index(tk.END)
        
        # Insert text before "trade"
        self.log_text.insert(tk.END, message[:trade_start])
        
        # Insert "trade" with clickable formatting
        trade_start_index = self.log_text.index(tk.END)
        trade_word = message[trade_start:trade_start + 5]  # "trade"
        self.log_text.insert(tk.END, trade_word)
        trade_end_index = self.log_text.index(tk.END)
        
        # Insert rest of message
        self.log_text.insert(tk.END, message[trade_start + 5:] + "\n")
        
        # Create clickable tag for "trade"
        trade_tag = f"clickable_trade_{int(time.time() * 1000)}"  # Unique tag
        self.log_text.tag_add(trade_tag, trade_start_index, trade_end_index)
        self.log_text.tag_config(trade_tag, foreground='lightblue', underline=True)
        
        # Bind click event to open trades dialog
        self.log_text.tag_bind(trade_tag, "<Button-1>", 
                              lambda e: self.open_global_trades_dialog())
        
        # Change cursor on hover
        self.log_text.tag_bind(trade_tag, "<Enter>", 
                              lambda e: self.log_text.config(cursor="hand2"))
        self.log_text.tag_bind(trade_tag, "<Leave>", 
                              lambda e: self.log_text.config(cursor=""))
        
        self.log_text.see(tk.END)
    
    def add_clickable_log_message(self, message, trade_data):
        """Add clickable trade message to log; works even if log window is closed."""
        entry = {"text": message + " [Click for details]", "click": {"type": "trade", "data": trade_data}}
        self._log_buffer.append(entry)
        if self.log_text is not None:
            self._append_log_entry_to_widget(entry)

    def _append_log_entry_to_widget(self, entry):
        """Render a single buffered entry into the log text widget with proper bindings."""
        if self.log_text is None:
            return
        text = entry.get("text", "")
        click = entry.get("click")
        if not click:
            self.log_text.insert(tk.END, text + "\n")
            self.log_text.see(tk.END)
            return

        # Clickable entry
        start_index = self.log_text.index(tk.END)
        self.log_text.insert(tk.END, text + "\n")
        end_index = self.log_text.index(tk.END)
        tag_name = f"log_click_{int(time.time()*1000)}"
        self.log_text.tag_add(tag_name, start_index, end_index)
        self.log_text.tag_config(tag_name, foreground='lightblue', underline=True)
        if click.get("type") == "trade":
            data = click.get("data")
            self.log_text.tag_bind(tag_name, "<Button-1>", lambda e, d=data: self.show_trade_details(d))
        else:
            # Default action: no-op
            pass
        self.log_text.tag_bind(tag_name, "<Enter>", lambda e: self.log_text.config(cursor="hand2"))
        self.log_text.tag_bind(tag_name, "<Leave>", lambda e: self.log_text.config(cursor=""))
        self.log_text.see(tk.END)

    def open_log_window(self, show: bool = True):
        """Open or focus the game log window with a scrollable text area.
        If show=False, create and keep it hidden (used for warm-up).
        """
        try:
            if self.log_window is not None and tk.Toplevel.winfo_exists(self.log_window):
                if show:
                    # Bring to front
                    self.log_window.deiconify()
                    self.log_window.lift()
                    self.log_window.focus_force()
                return
        except Exception:
            # Consider it closed if any error
            self.log_window = None
            self.log_text = None

        win = tk.Toplevel(self.root)
        win.title("Game Log")
        win.geometry("640x360")
        win.configure(bg=self.colors['bg'])
        win.transient(self.root)

        # On close, reset references
        def _on_close():
            self.log_window = None
            self.log_text = None
            win.destroy()
        win.protocol("WM_DELETE_WINDOW", _on_close)

        # Content
        frame = ttk.Frame(win, padding=8)
        frame.pack(fill=tk.BOTH, expand=True)
        frame.grid_rowconfigure(0, weight=1)
        frame.grid_columnconfigure(0, weight=1)

        text = tk.Text(frame, bg=self.colors['card_bg'], fg=self.colors['text'], wrap=tk.WORD)
        scroll = ttk.Scrollbar(frame, orient="vertical", command=text.yview)
        text.configure(yscrollcommand=scroll.set)
        text.grid(row=0, column=0, sticky='nsew')
        scroll.grid(row=0, column=1, sticky='ns')

        self.log_window = win
        self.log_text = text

        # Populate from buffer
        for entry in self._log_buffer:
            self._append_log_entry_to_widget(entry)
        # If warming up, keep it hidden until user opens
        if not show:
            try:
                win.withdraw()
            except Exception:
                pass

    def _warmup_ui(self):
        """Preload UI modules and windows to eliminate cold-start lag on first click."""
        # Pre-import dialog modules so Python compiles/loads them before user interaction
        try:
            import trades_viewer  # noqa: F401
            import trading  # noqa: F401
            import combined_trading  # noqa: F401
            import save_load  # noqa: F401
        except Exception:
            pass

        # Pre-create (hidden) log window so first open is instant
        try:
            self.open_log_window(show=False)
        except Exception:
            pass

        # Pre-create small hidden windows to initialize Tk resources used by dialogs
        self._prime_tk_dialogs()

    def _prime_tk_dialogs(self):
        """Create and immediately withdraw small windows to warm up Tk internals used by dialogs."""
        try:
            # Generic tiny window
            w = tk.Toplevel(self.root)
            w.title("warmup")
            w.geometry("1x1+0+0")
            w.update_idletasks()
            w.withdraw()
        except Exception:
            return
        finally:
            try:
                # Destroy later to keep minimal footprint
                self.root.after(500, lambda: (w.destroy() if w and w.winfo_exists() else None))
            except Exception:
                pass
    
    def show_trade_details(self, trade_data):
        """Show detailed trade information dialog"""
        trade = trade_data['trade']
        
        details_dialog = tk.Toplevel(self.root)
        details_dialog.title("Trade Details")
        details_dialog.geometry("500x400")
        details_dialog.configure(bg='#2c3e50')
        details_dialog.transient(self.root)
        details_dialog.grab_set()
        
        # Center the dialog
        details_dialog.update_idletasks()
        x = self.root.winfo_x() + (self.root.winfo_width() // 2) - (details_dialog.winfo_width() // 2)
        y = self.root.winfo_y() + (self.root.winfo_height() // 2) - (details_dialog.winfo_height() // 2)
        details_dialog.geometry(f"+{x}+{y}")
        
        main_frame = ttk.Frame(details_dialog, padding=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title_label = ttk.Label(main_frame, text="📊 Trade Details", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 15))
        
        # Trade summary
        summary_frame = ttk.LabelFrame(main_frame, text="Trade Summary", padding=10)
        summary_frame.pack(fill='x', pady=(0, 10))
        
        summary_text = trade.get_summary()
        summary_label = ttk.Label(summary_frame, text=summary_text, 
                                 font=('Arial', 11), justify=tk.LEFT)
        summary_label.pack(anchor='w')
        
        # Timing information
        timing_frame = ttk.LabelFrame(main_frame, text="Timing", padding=10)
        timing_frame.pack(fill='x', pady=(0, 10))
        
        import datetime
        proposed_time = datetime.datetime.fromtimestamp(trade.timestamp).strftime("%Y-%m-%d %H:%M:%S")
        completed_time = datetime.datetime.fromtimestamp(trade_data['completed_at']).strftime("%Y-%m-%d %H:%M:%S")
        
        ttk.Label(timing_frame, text=f"Proposed: {proposed_time}").pack(anchor='w')
        ttk.Label(timing_frame, text=f"Completed: {completed_time}").pack(anchor='w')
        
        # Property details if any
        if trade.offered_properties or trade.requested_properties:
            props_frame = ttk.LabelFrame(main_frame, text="Property Details", padding=10)
            props_frame.pack(fill='x', pady=(0, 10))
            
            if trade.offered_properties:
                ttk.Label(props_frame, text=f"{trade.proposer.name} gave:", 
                         font=('Arial', 10, 'bold')).pack(anchor='w')
                for prop in trade.offered_properties:
                    ttk.Label(props_frame, text=f"  • {prop.name}", 
                             font=('Arial', 9)).pack(anchor='w')
            
            if trade.requested_properties:
                ttk.Label(props_frame, text=f"{trade.recipient.name} gave:", 
                         font=('Arial', 10, 'bold')).pack(anchor='w', pady=(5, 0))
                for prop in trade.requested_properties:
                    ttk.Label(props_frame, text=f"  • {prop.name}", 
                             font=('Arial', 9)).pack(anchor='w')
        
        # Money details
        if trade.offered_money > 0 or trade.requested_money > 0:
            money_frame = ttk.LabelFrame(main_frame, text="Money Exchange", padding=10)
            money_frame.pack(fill='x', pady=(0, 10))
            
            if trade.offered_money > 0:
                ttk.Label(money_frame, text=f"{trade.proposer.name} paid: ${trade.offered_money}", 
                         font=('Arial', 10)).pack(anchor='w')
            if trade.requested_money > 0:
                ttk.Label(money_frame, text=f"{trade.recipient.name} paid: ${trade.requested_money}", 
                         font=('Arial', 10)).pack(anchor='w')
        
        # Close button
        ttk.Button(main_frame, text="Close", 
                  command=details_dialog.destroy).pack(pady=(10, 0))
    
    def update_dice_display(self, dice1, dice2):
        """Update dice display"""
        dice_faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
        self.dice_label.config(text=f"{dice_faces[dice1-1]} {dice_faces[dice2-1]}")
    
    def show_property_dialog(self, property_obj):
        """Show enhanced property information dialog with full card details"""
        dialog = tk.Toplevel(self.root)
        dialog.title(f"Property Card: {property_obj.name}")
        dialog.geometry("400x600")
        dialog.configure(bg='#2c3e50')
        dialog.resizable(False, False)
        
        # Center the dialog
        dialog.transient(self.root)
        dialog.update_idletasks()
        x = self.root.winfo_x() + (self.root.winfo_width() // 2) - (dialog.winfo_width() // 2)
        y = self.root.winfo_y() + (self.root.winfo_height() // 2) - (dialog.winfo_height() // 2)
        dialog.geometry(f"+{x}+{y}")
        
        # Only grab set after dialog is fully visible
        dialog.after(10, lambda: dialog.grab_set())
        
        # Main container
        main_frame = tk.Frame(dialog, bg='#2c3e50')
        main_frame.pack(fill=tk.BOTH, expand=True, padx=15, pady=15)
        
        # Property header with color coding
        header_frame = tk.Frame(main_frame, bg=getattr(property_obj, 'color', '#34495e'), height=40)
        header_frame.pack(fill='x', pady=(0, 10))
        header_frame.pack_propagate(False)
        
        # Property name
        name_label = tk.Label(header_frame, text=property_obj.name, 
                             font=('Arial', 14, 'bold'), bg=header_frame['bg'], fg='white')
        name_label.pack(expand=True)
        
        # Property details section
        details_frame = tk.Frame(main_frame, bg='#2c3e50')
        details_frame.pack(fill='both', expand=True)
        
        if hasattr(property_obj, 'price'):
            # Price section
            price_frame = tk.LabelFrame(details_frame, text="💰 Property Information", 
                                       bg='#34495e', fg='white', font=('Arial', 10, 'bold'))
            price_frame.pack(fill='x', pady=(0, 10), padx=5)
            
            info_text = f"Purchase Price: ${property_obj.price}\n"
            info_text += f"Mortgage Value: ${property_obj.price // 2}\n"
            
            if hasattr(property_obj, 'color_group'):
                info_text += f"Color Group: {property_obj.color_group}\n"
            
            tk.Label(price_frame, text=info_text, bg='#34495e', fg='white', 
                    font=('Arial', 10), justify='left').pack(anchor='w', padx=10, pady=5)
            
            # Rent section
            rent_frame = tk.LabelFrame(details_frame, text="🏠 Rent Information",
                                      bg='#34495e', fg='white', font=('Arial', 10, 'bold'))
            rent_frame.pack(fill='x', pady=(0, 10), padx=5)

            rent_lines = []
            # Base properties: show static rent schedule regardless of owner/mortgage
            if getattr(property_obj, 'type', 'property') == 'property':
                base = getattr(property_obj, 'rent', 0)
                rent_lines.append(f"Base Rent: ${base} (doubles with monopoly)")
                rwh = getattr(property_obj, 'rent_with_houses', {})
                if rwh:
                    rent_lines.append(f"With 1 House: ${rwh.get(1, 0)}")
                    rent_lines.append(f"With 2 Houses: ${rwh.get(2, 0)}")
                    rent_lines.append(f"With 3 Houses: ${rwh.get(3, 0)}")
                    rent_lines.append(f"With 4 Houses: ${rwh.get(4, 0)}")
                    rent_lines.append(f"With Hotel: ${rwh.get(5, 0)}")
                rent_lines.append("")
                rent_lines.append(f"House Cost: ${getattr(property_obj, 'house_cost', 0)} each")
                rent_lines.append(f"Hotel Cost: ${getattr(property_obj, 'house_cost', 0)} plus 4 houses")
            elif getattr(property_obj, 'type', '') == 'railroad':
                rent_lines.append("Base Rent: $25 (varies by railroads owned)")
                rent_lines.append("With 2 Railroads: $50")
                rent_lines.append("With 3 Railroads: $100")
                rent_lines.append("With 4 Railroads: $200")
            elif getattr(property_obj, 'type', '') == 'utility':
                rent_lines.append("If 1 Utility owned: 4 × dice roll")
                rent_lines.append("If 2 Utilities owned: 10 × dice roll")

            tk.Label(rent_frame, text="\n".join(rent_lines), bg='#34495e', fg='white',
                    font=('Arial', 10), justify='left').pack(anchor='w', padx=10, pady=5)
            
            # Ownership section
            owner_frame = tk.LabelFrame(details_frame, text="👤 Ownership",
                                       bg='#34495e', fg='white', font=('Arial', 10, 'bold'))
            owner_frame.pack(fill='x', pady=(0, 10), padx=5)
            
            if property_obj.owner:
                owner_text = f"Owned by: {property_obj.owner.name}\n"
                owner_text += f"Houses: {getattr(property_obj, 'houses', 0)}\n"
                owner_text += f"Hotels: {1 if getattr(property_obj, 'houses', 0) == 5 else 0}\n"
                if hasattr(property_obj, 'mortgaged'):
                    owner_text += f"Mortgaged: {'Yes' if property_obj.mortgaged else 'No'}"
            else:
                owner_text = "Available for purchase"
            
            tk.Label(owner_frame, text=owner_text, bg='#34495e', fg='white',
                    font=('Arial', 10), justify='left').pack(anchor='w', padx=10, pady=5)
        
        else:
            # Special space information
            special_frame = tk.LabelFrame(details_frame, text="ℹ️ Special Space",
                                         bg='#34495e', fg='white', font=('Arial', 10, 'bold'))
            special_frame.pack(fill='x', pady=(0, 10), padx=5)
            
            special_text = f"Type: {getattr(property_obj, 'type', 'Special')}\n"
            special_text += f"Description: {getattr(property_obj, 'description', 'No description available')}"
            
            tk.Label(special_frame, text=special_text, bg='#34495e', fg='white',
                    font=('Arial', 10), justify='left').pack(anchor='w', padx=10, pady=5)
        
        # Action buttons (mortgage/unmortgage for owner on their turn; no buy here)
        button_frame = tk.Frame(details_frame, bg='#2c3e50')
        button_frame.pack(fill='x', pady=(10, 0))
        
        current_player = self.game.get_current_player()
        is_owner_turn = (getattr(property_obj, 'owner', None) == current_player)
        
        def do_mortgage():
            if not hasattr(property_obj, 'mortgaged') or property_obj.mortgaged:
                return
            property_obj.mortgaged = True
            current_player.money += property_obj.price // 2
            self.add_log_message(f"{current_player.name} mortgaged {property_obj.name} for ${property_obj.price // 2}")
            self.update_display()
            dialog.destroy()
        
        def do_unmortgage():
            if not hasattr(property_obj, 'mortgaged') or not property_obj.mortgaged:
                return
            cost = property_obj.price // 2
            if current_player.money < cost:
                messagebox.showwarning("Insufficient Funds", f"Need ${cost} to unmortgage.")
                return
            current_player.money -= cost
            property_obj.mortgaged = False
            self.add_log_message(f"{current_player.name} unmortgaged {property_obj.name} for ${cost}")
            self.update_display()
            dialog.destroy()

            # Houses/hotels controls
            def owns_full_set():
                if not hasattr(property_obj, 'color_group'):
                    return False
                group = property_obj.color_group
                group_props = [p for p in self.game.players[self.game.current_player_index].properties if hasattr(p, 'color_group') and p.color_group == group and not getattr(p, 'is_special', False)]
                return len(group_props) == len(COLOR_GROUPS.get(group, []))

            def can_buy_house():
                return (is_owner_turn and owns_full_set() and not property_obj.mortgaged and property_obj.houses < 5 and current_player.money >= property_obj.house_cost)

            def can_sell_house():
                return (is_owner_turn and property_obj.houses > 0)

            def do_buy_house():
                if not can_buy_house():
                    return
                current_player.money -= property_obj.house_cost
                property_obj.houses += 1
                self.add_log_message(f"{current_player.name} bought a house on {property_obj.name} for ${property_obj.house_cost}")
                self.update_display()
                dialog.destroy()

            def do_sell_house():
                if not can_sell_house():
                    return
                property_obj.houses -= 1
                current_player.money += property_obj.house_cost // 2
                self.add_log_message(f"{current_player.name} sold a house on {property_obj.name} for ${property_obj.house_cost // 2}")
                self.update_display()
                dialog.destroy()

            # Show house/hotel controls only for owner, full set, not mortgaged
            if is_owner_turn and hasattr(property_obj, 'house_cost') and owns_full_set() and not property_obj.mortgaged:
                if property_obj.houses < 5:
                    buy_house_btn = tk.Button(button_frame, text=f"🏠 Buy House (${property_obj.house_cost})", command=do_buy_house, bg='#27ae60', fg='white', font=('Arial', 10, 'bold'))
                    buy_house_btn.pack(side='left', padx=(0, 10))
                if property_obj.houses > 0:
                    sell_house_btn = tk.Button(button_frame, text=f"🏚️ Sell House (+${property_obj.house_cost // 2})", command=do_sell_house, bg='#c0392b', fg='white', font=('Arial', 10, 'bold'))
                    sell_house_btn.pack(side='left', padx=(0, 10))
        
        if is_owner_turn and hasattr(property_obj, 'price'):
            if not property_obj.mortgaged:
                mort_btn = tk.Button(button_frame, text=f"🏦 Mortgage (+${property_obj.price // 2})",
                                     command=do_mortgage, bg='#8e44ad', fg='white', font=('Arial', 10, 'bold'))
                mort_btn.pack(side='left', padx=(0, 10))
            else:
                unmort_btn = tk.Button(button_frame, text=f"💳 Unmortgage (-${property_obj.price // 2})",
                                       command=do_unmortgage, bg='#2980b9', fg='white', font=('Arial', 10, 'bold'))
                unmort_btn.pack(side='left', padx=(0, 10))
            
            def do_sell_to_bank():
                # Clear ownership and reset house/mortgage state
                if property_obj.owner != current_player:
                    return
                property_obj.owner = None
                if property_obj in current_player.properties:
                    current_player.properties.remove(property_obj)
                property_obj.houses = 0
                property_obj.mortgaged = False
                self.add_log_message(f"{current_player.name} sold {property_obj.name} back to the bank for $0")
                self.update_display()
                dialog.destroy()
            
            sell_btn = tk.Button(button_frame, text="🏦 Sell to Bank ($0)",
                                 command=do_sell_to_bank, bg='#7f8c8d', fg='white', font=('Arial', 10, 'bold'))
            sell_btn.pack(side='left', padx=(0, 10))
        
        close_btn = tk.Button(button_frame, text="❌ Close", command=dialog.destroy,
                             bg='#e74c3c', fg='white', font=('Arial', 10, 'bold'))
        close_btn.pack(side='right')
        
    
    
    def buy_property_action(self, property_obj, dialog):
        """Handle property purchase from dialog"""
        current_player = self.game.get_current_player()
        if current_player.buy_property(property_obj):
            self.add_log_message(f"{current_player.name} bought {property_obj.name} for ${property_obj.price}")
            self.update_display()
            dialog.destroy()
        else:
            messagebox.showerror("Purchase Failed", "Cannot buy this property!")
    
    def on_space_click(self, position):
        """Handle board space click"""
        space = get_property_by_position(position)
        if space and hasattr(space, 'price'):
            self.show_property_dialog(space)
    
    # Game control methods (to be connected to game logic)
    def roll_dice(self):
        """Roll dice button callback"""
        if hasattr(self.game, 'roll_dice'):
            self.game.roll_dice()
            self.update_action_buttons()  # Update button states after rolling
            self.update_vote_kick_display()
    
    def buy_property(self):
        """Buy property button callback"""
        if hasattr(self.game, 'buy_current_property'):
            self.game.buy_current_property()
            self.update_action_buttons()  # Update button states after buying
    
    def end_turn(self):
        """End turn button callback"""
        current_player = self.game.get_current_player()
        
        # Check if player is bankrupt
        if current_player.bankrupt:
            messagebox.showinfo("Player Bankrupt", f"{current_player.name} is bankrupt and cannot take turns!")
            return
        
        # Block end turn if negative cash
        if current_player.money < 0:
            message = (
                f"{current_player.name} has negative cash (${current_player.money}).\n\n"
                "You must resolve this before ending your turn.\n\nOptions:\n"
                "• Manage or negotiate payments\n"
                "• Mortgage properties or trade\n"
                "• Declare bankruptcy"
            )
            result = messagebox.askyesnocancel(
                "Negative Balance",
                message + "\n\nDeclare bankruptcy now?",
                icon="warning"
            )
            if result is True:
                self.handle_bankruptcy(current_player)
            elif result is False:
                # Open payments dialog (works even if list is empty; shows status)
                self.show_payment_management_dialog(current_player)
            return
        
        # Check if player has pending payments
        if current_player.has_pending_payments():
            pending_total = current_player.get_pending_payment_total()
            pending_details = []
            for payment in current_player.pending_payments:
                pending_details.append(f"${payment['amount']} to {payment['creditor'].name}")
            
            message = f"Cannot end turn with pending payments!\n\n"
            message += f"Outstanding payments:\n"
            for detail in pending_details:
                message += f"  • {detail}\n"
            message += f"\nTotal owed: ${pending_total}"
            message += f"\nCurrent balance: ${current_player.money}"
            message += f"\n\nOptions:"
            message += f"\n• Mortgage properties to raise funds"
            message += f"\n• Make trades with other players"
            message += f"\n• Declare bankruptcy if unable to pay"
            
            # Show options dialog
            result = messagebox.askyesnocancel(
                "Pending Payments", 
                message + "\n\nDeclare bankruptcy now?",
                icon="warning"
            )
            
            if result is True:  # Yes - declare bankruptcy
                self.handle_bankruptcy(current_player)
            elif result is False:  # No - show payment management dialog
                self.show_payment_management_dialog(current_player)
            # Cancel - do nothing, let player continue their turn
            return
        
        # Normal end turn
        if hasattr(self.game, 'end_turn'):
            self.game.end_turn()
            self.update_action_buttons()  # Update button states after ending turn
            self.update_vote_kick_display()
    
    def show_payment_management_dialog(self, player):
        """Show dialog for managing pending payments"""
        from tkinter import messagebox
        import tkinter as tk
        import tkinter.ttk as ttk
        
        dialog = tk.Toplevel(self.root)
        dialog.title(f"Manage Payments - {player.name}")
        dialog.geometry("500x400")
        dialog.configure(bg='#2c3e50')
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Center dialog
        dialog.update_idletasks()
        x = (dialog.winfo_screenwidth() // 2) - (dialog.winfo_reqwidth() // 2)
        y = (dialog.winfo_screenheight() // 2) - (dialog.winfo_reqheight() // 2)
        dialog.geometry(f"+{x}+{y}")
        
        main_frame = ttk.Frame(dialog)
        main_frame.pack(expand=True, fill='both', padx=20, pady=20)
        
        # Current status
        status_frame = ttk.LabelFrame(main_frame, text="Current Status", padding=10)
        status_frame.pack(fill='x', pady=(0, 10))
        
        ttk.Label(status_frame, text=f"Cash: ${player.money}").pack(anchor='w')
        ttk.Label(status_frame, text=f"Total owed: ${player.get_pending_payment_total()}").pack(anchor='w')
        
        # Pending payments list
        payments_frame = ttk.LabelFrame(main_frame, text="Pending Payments", padding=10)
        payments_frame.pack(fill='both', expand=True, pady=(0, 10))
        
        # Create listbox for payments
        payments_listbox = tk.Listbox(payments_frame, height=5)
        payments_listbox.pack(fill='both', expand=True, pady=(0, 10))
        
        for i, payment in enumerate(player.pending_payments):
            payments_listbox.insert(tk.END, f"${payment['amount']} to {payment['creditor'].name}")
        
        # Action buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill='x')
        
        def try_pay_selected():
            selection = payments_listbox.curselection()
            if selection:
                index = selection[0]
                if player.try_pay_pending_payment(index):
                    # Refresh dialog
                    dialog.destroy()
                    if player.has_pending_payments():
                        self.show_payment_management_dialog(player)
                    else:
                        messagebox.showinfo("Payments Complete", "All payments resolved!")
        
        def close_dialog():
            dialog.destroy()
        
        ttk.Button(button_frame, text="Pay Selected", command=try_pay_selected).pack(side='left', padx=(0, 10))
        ttk.Button(button_frame, text="Close", command=close_dialog).pack(side='left')
    
    def handle_bankruptcy(self, player):
        """Handle player bankruptcy by delegating to the game to remove them fully."""
        # Identify a creditor if applicable (largest pending payment), else None
        creditor = None
        try:
            if player.pending_payments:
                largest_payment = max(player.pending_payments, key=lambda p: p['amount'])
                creditor = largest_payment['creditor']
        except Exception:
            creditor = None

        # Ask game to remove the player entirely
        if hasattr(self.game, 'remove_player_from_game'):
            self.game.remove_player_from_game(player, creditor)
        else:
            # Fallback: mark bankrupt
            player.bankrupt = True
            self.add_log_message(f"{player.name} declared bankruptcy!")
            if hasattr(self.game, 'update_display'):
                self.game.update_display()
    
    def open_trade_dialog(self):
        """Open trading dialog"""
        from trading import open_trading_dialog
        open_trading_dialog(self.root, self.game.get_current_player(), self.game.players, self.game)
    
    def open_pending_trades_dialog(self):
        """Open pending trades dialog - shows all trades with details"""
        from trades_viewer import AllTradesDialog
        AllTradesDialog(self.root, self.game.get_current_player(), self.game)
    
    # Legacy Super Simple Enhanced dialog removed
    
    def open_global_trades_dialog(self):
        """Open global pending trades dialog - same as pending trades"""
        from trades_viewer import AllTradesDialog
        AllTradesDialog(self.root, self.game.get_current_player(), self.game)

    def open_combined_trading_dialog(self):
        """Open the Advanced Combined Trading dialog (checkbox-based functions)"""
        # Check for available partners
        available_partners = [p for p in self.game.players if p != self.game.get_current_player() and not p.bankrupt]
        if not available_partners:
            messagebox.showwarning("No Partners", "No other players available for trading")
            return
        # Open the dialog
        from combined_trading import open_combined_trade_dialog
        open_combined_trade_dialog(self.root, self.game.get_current_player(), self.game.players, self.game)
    
    def save_game(self):
        """Save game button callback"""
        from save_load import save_game
        save_game(self.game)
    
    def load_game(self):
        """Load game button callback"""
        from save_load import load_game
        load_game(self.game)
    
    def run(self):
        """Start the GUI main loop"""
        self.root.mainloop()
