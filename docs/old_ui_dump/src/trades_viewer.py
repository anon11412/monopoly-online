"""
Simple and effective trades viewer for Monopoly game
Shows all pending trades with full details for all players
"""

import tkinter as tk
from tkinter import ttk, messagebox

class AllTradesDialog:
    """Simple dialog to view all pending trades with details"""
    
    def __init__(self, parent, current_player, game):
        self.parent = parent
        self.current_player = current_player
        self.game = game
        self.dialog = None
        
        self.create_dialog()
        
    def create_dialog(self):
        """Create the main dialog window"""
        self.dialog = tk.Toplevel(self.parent)
        self.dialog.title("All Pending Trades")
        self.dialog.geometry("800x600")
        self.dialog.resizable(True, True)
        
        # Center the dialog
        self.center_dialog()
        
                # Make dialog modal and add click-outside-to-close
        self.dialog.grab_set()
        self.dialog.focus_set()
        
        # Bind click outside to close
        self.setup_click_outside_to_close()
    
    def setup_click_outside_to_close(self):
        """Setup click outside dialog to close it"""
        def on_click_outside(event):
            # Safely handle if dialog is already gone
            try:
                if self.dialog is None or not self.dialog.winfo_exists():
                    return
                # Check if click is outside the dialog
                x, y = event.x_root, event.y_root
                dialog_x = self.dialog.winfo_rootx()
                dialog_y = self.dialog.winfo_rooty()
                dialog_width = self.dialog.winfo_width()
                dialog_height = self.dialog.winfo_height()
                if (x < dialog_x or x > dialog_x + dialog_width or
                        y < dialog_y or y > dialog_y + dialog_height):
                    try:
                        self.dialog.destroy()
                    except Exception:
                        pass
            except Exception:
                # Ignore spurious events during teardown
                pass
        
        # Bind to root window with a small delay to avoid immediate closure
        self.dialog.after(100, lambda: self.parent.bind("<Button-1>", on_click_outside, "+"))
        
        # Clean up binding when dialog is destroyed
        def cleanup():
            try:
                self.parent.unbind("<Button-1>", on_click_outside)
            except:
                pass
        
        self.dialog.protocol("WM_DELETE_WINDOW", lambda: [cleanup(), self.dialog.destroy()])
        
        # Add click-outside-to-close functionality
        self.dialog.bind('<Button-1>', self.on_click_outside)
        
        # Main frame
        main_frame = ttk.Frame(self.dialog)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Prevent clicking on main frame from closing dialog
        main_frame.bind('<Button-1>', lambda e: e.stopPropagation() if hasattr(e, 'stopPropagation') else None)
        
        # Title
        title_label = ttk.Label(main_frame, text="🔄 All Pending Trades", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 10))
        
        # Info label
        info_text = f"Viewing as: {self.current_player.name}"
        info_label = ttk.Label(main_frame, text=info_text, font=('Arial', 10))
        info_label.pack(pady=(0, 10))
        
        # Scrollable frame for trades
        self.create_scrollable_trades_area(main_frame)
        
        # Buttons frame
        buttons_frame = ttk.Frame(main_frame)
        buttons_frame.pack(fill=tk.X, pady=(10, 0))
        
        # Refresh button
        refresh_btn = ttk.Button(buttons_frame, text="🔄 Refresh", 
                                command=self.refresh_trades)
        refresh_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        # Create new trade button
        new_trade_btn = ttk.Button(buttons_frame, text="➕ Create New Trade", 
                                  command=self.create_new_trade)
        new_trade_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        # Close button
        close_btn = ttk.Button(buttons_frame, text="❌ Close", 
                              command=self.dialog.destroy)
        close_btn.pack(side=tk.RIGHT)
        
        # Load trades
        self.refresh_trades()
        
    def create_scrollable_trades_area(self, parent):
        """Create scrollable area for trades"""
        # Frame with scrollbar
        scroll_frame = ttk.Frame(parent)
        scroll_frame.pack(fill=tk.BOTH, expand=True)
        
        # Canvas and scrollbar
        canvas = tk.Canvas(scroll_frame, bg='white')
        scrollbar = ttk.Scrollbar(scroll_frame, orient="vertical", command=canvas.yview)
        
        # Scrollable frame inside canvas
        self.trades_frame = ttk.Frame(canvas)
        
        # Configure scrolling
        self.trades_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=self.trades_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # Pack canvas and scrollbar
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Store references
        self.canvas = canvas
        
    def refresh_trades(self):
        """Refresh the trades display"""
        # Clear existing trades
        for widget in self.trades_frame.winfo_children():
            widget.destroy()
        
        # Get all pending trades
        if not hasattr(self.game, 'get_all_pending_trades'):
            self.show_no_trades("No trades system available")
            return
            
        trades = self.game.get_all_pending_trades()
        
        if not trades:
            self.show_no_trades("No pending trades")
            return
        
        # Show each trade
        for i, trade in enumerate(trades):
            self.create_trade_widget(trade, i)
            
    def show_no_trades(self, message):
        """Show message when no trades available"""
        no_trades_label = ttk.Label(self.trades_frame, text=message, 
                                   font=('Arial', 12), foreground='gray')
        no_trades_label.pack(pady=20)
        
    def create_trade_widget(self, trade, index):
        """Create a widget to display a single trade"""
        # Main trade frame with border
        trade_frame = ttk.LabelFrame(self.trades_frame, 
                                    text=f"Trade #{index + 1}", 
                                    padding=10)
        trade_frame.pack(fill=tk.X, pady=5, padx=10)
        
        # Trade participants
        participants_frame = ttk.Frame(trade_frame)
        participants_frame.pack(fill=tk.X, pady=(0, 10))
        
        proposer_label = ttk.Label(participants_frame, 
                                  text=f"From: {trade.proposer.name}", 
                                  font=('Arial', 12, 'bold'), 
                                  foreground='blue')
        proposer_label.pack(side=tk.LEFT)
        
        arrow_label = ttk.Label(participants_frame, text=" ➜ ", 
                               font=('Arial', 12))
        arrow_label.pack(side=tk.LEFT)
        
        recipient_label = ttk.Label(participants_frame, 
                                   text=f"To: {trade.recipient.name}", 
                                   font=('Arial', 12, 'bold'), 
                                   foreground='green')
        recipient_label.pack(side=tk.LEFT)
        
        # Trade details frame
        details_frame = ttk.Frame(trade_frame)
        details_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Left side - what proposer offers
        offer_frame = ttk.LabelFrame(details_frame, text="Offering:", padding=5)
        offer_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))
        
        if trade.offered_properties:
            for prop in trade.offered_properties:
                prop_label = ttk.Label(offer_frame, text=f"🏠 {prop.name}")
                prop_label.pack(anchor=tk.W)
        
        if trade.offered_money > 0:
            money_label = ttk.Label(offer_frame, text=f"💰 ${trade.offered_money}")
            money_label.pack(anchor=tk.W)
            
        if not trade.offered_properties and trade.offered_money == 0:
            nothing_label = ttk.Label(offer_frame, text="Nothing", foreground='gray')
            nothing_label.pack(anchor=tk.W)
        
        # Right side - what proposer requests
        request_frame = ttk.LabelFrame(details_frame, text="Requesting:", padding=5)
        request_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5, 0))
        
        if trade.requested_properties:
            for prop in trade.requested_properties:
                prop_label = ttk.Label(request_frame, text=f"🏠 {prop.name}")
                prop_label.pack(anchor=tk.W)
        
        if trade.requested_money > 0:
            money_label = ttk.Label(request_frame, text=f"💰 ${trade.requested_money}")
            money_label.pack(anchor=tk.W)
            
        if not trade.requested_properties and trade.requested_money == 0:
            nothing_label = ttk.Label(request_frame, text="Nothing", foreground='gray')
            nothing_label.pack(anchor=tk.W)
        
        # Advanced trade details - Function blocks
        if hasattr(trade, 'function_blocks') and trade.function_blocks:
            advanced_frame = ttk.LabelFrame(trade_frame, text="⚡ Advanced Terms:", padding=5)
            advanced_frame.pack(fill=tk.X, pady=(10, 0))
            
            for i, block in enumerate(trade.function_blocks):
                block_text = f"{i+1}. {block['name']}"
                if hasattr(trade, 'block_variables') and block['id'] in trade.block_variables:
                    vars_text = []
                    for var, value in trade.block_variables[block['id']].items():
                        if value:
                            vars_text.append(f"{var}: {value}")
                    if vars_text:
                        block_text += f" ({', '.join(vars_text)})"
                
                block_label = ttk.Label(advanced_frame, text=block_text, foreground='purple')
                block_label.pack(anchor=tk.W)
        
        # Bilateral function blocks (if both sides have blocks)
        if hasattr(trade, 'proposer_blocks') and trade.proposer_blocks:
            proposer_blocks_frame = ttk.LabelFrame(trade_frame, text=f"⚡ {trade.proposer.name}'s Terms:", padding=5)
            proposer_blocks_frame.pack(fill=tk.X, pady=(5, 0))
            
            for i, block in enumerate(trade.proposer_blocks):
                block_text = f"{i+1}. {block['name']}"
                if hasattr(trade, 'proposer_block_variables') and block['id'] in trade.proposer_block_variables:
                    vars_text = []
                    for var, value in trade.proposer_block_variables[block['id']].items():
                        if value:
                            vars_text.append(f"{var}: {value}")
                    if vars_text:
                        block_text += f" ({', '.join(vars_text)})"
                
                block_label = ttk.Label(proposer_blocks_frame, text=block_text, foreground='blue')
                block_label.pack(anchor=tk.W)
        
        if hasattr(trade, 'recipient_blocks') and trade.recipient_blocks:
            recipient_blocks_frame = ttk.LabelFrame(trade_frame, text=f"⚡ {trade.recipient.name}'s Terms:", padding=5)
            recipient_blocks_frame.pack(fill=tk.X, pady=(5, 0))
            
            for i, block in enumerate(trade.recipient_blocks):
                block_text = f"{i+1}. {block['name']}"
                if hasattr(trade, 'recipient_block_variables') and block['id'] in trade.recipient_block_variables:
                    vars_text = []
                    for var, value in trade.recipient_block_variables[block['id']].items():
                        if value:
                            vars_text.append(f"{var}: {value}")
                    if vars_text:
                        block_text += f" ({', '.join(vars_text)})"
                
                block_label = ttk.Label(recipient_blocks_frame, text=block_text, foreground='green')
                block_label.pack(anchor=tk.W)
        
        # Action buttons frame
        actions_frame = ttk.Frame(trade_frame)
        actions_frame.pack(fill=tk.X, pady=(10, 0))
        
        # Show different buttons based on who the current player is
        if trade.recipient == self.current_player:
            # Current player is the recipient - can accept/reject
            accept_btn = ttk.Button(actions_frame, text="✅ Accept Trade", 
                                   command=lambda: self.accept_trade(trade))
            accept_btn.pack(side=tk.LEFT, padx=(0, 5))
            
            reject_btn = ttk.Button(actions_frame, text="❌ Reject Trade", 
                                   command=lambda: self.reject_trade(trade))
            reject_btn.pack(side=tk.LEFT, padx=(0, 5))
            
        elif trade.proposer == self.current_player:
            # Current player is the proposer - can withdraw
            withdraw_btn = ttk.Button(actions_frame, text="🔙 Withdraw Trade", 
                                     command=lambda: self.withdraw_trade(trade))
            withdraw_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        # Anyone can view details
        details_btn = ttk.Button(actions_frame, text="👁️ View Details", 
                                command=lambda: self.view_trade_details(trade))
        details_btn.pack(side=tk.RIGHT)
        
    def accept_trade(self, trade):
        """Accept a trade proposal"""
        # Confirm acceptance
        result = messagebox.askyesno("Accept Trade", 
                                   f"Are you sure you want to accept this trade from {trade.proposer.name}?")
        if not result:
            return
            
        try:
            # Execute via game to ensure function blocks are activated
            self.game.accept_trade(trade)
            
            # Update game display
            self.game.update_display()
            
            # Refresh this dialog
            self.refresh_trades()
            
            messagebox.showinfo("Trade Accepted", "Trade completed successfully!")
            
        except Exception as e:
            messagebox.showerror("Trade Failed", f"Error executing trade: {str(e)}")
    
    def reject_trade(self, trade):
        """Reject a trade proposal"""
        # Confirm rejection
        result = messagebox.askyesno("Reject Trade", 
                                   f"Are you sure you want to reject this trade from {trade.proposer.name}?")
        if not result:
            return
            
        # Remove from pending trades
        self.game.remove_pending_trade(trade)
        
        # Refresh this dialog
        self.refresh_trades()
        
        messagebox.showinfo("Trade Rejected", f"Trade from {trade.proposer.name} has been rejected.")
    
    def on_click_outside(self, event):
        """Handle click outside dialog to close it"""
        try:
            if self.dialog is None or not self.dialog.winfo_exists():
                return
            # Check if click was outside the main content area
            if event.widget == self.dialog:
                try:
                    self.dialog.destroy()
                except Exception:
                    pass
        except Exception:
            pass
    
    def withdraw_trade(self, trade):
        """Withdraw a trade proposal"""
        # Remove from pending trades (no confirmation needed)
        self.game.remove_pending_trade(trade)
        
        # Refresh this dialog
        self.refresh_trades()
        
        messagebox.showinfo("Trade Withdrawn", f"Your trade to {trade.recipient.name} has been withdrawn.")
    
    def execute_trade(self, trade):
        """Execute a trade between players"""
        proposer = trade.proposer
        recipient = trade.recipient
        
        # Transfer offered properties to recipient
        for prop in trade.offered_properties:
            if prop in proposer.properties:
                proposer.properties.remove(prop)
                recipient.properties.append(prop)
                prop.owner = recipient
        
        # Transfer requested properties to proposer
        for prop in trade.requested_properties:
            if prop in recipient.properties:
                recipient.properties.remove(prop)
                proposer.properties.append(prop)
                prop.owner = proposer
        
        # Transfer money
        proposer.money -= trade.offered_money
        recipient.money += trade.offered_money
        
        recipient.money -= trade.requested_money
        proposer.money += trade.requested_money
        
        # Log the trade
        trade_summary = trade.get_summary()
        self.game.gui.add_log_message(f"Trade completed: {trade_summary}")
    
    def view_trade_details(self, trade):
        """Show detailed view of a trade"""
        details_window = tk.Toplevel(self.dialog)
        details_window.title("Trade Details")
        details_window.geometry("600x400")
        details_window.resizable(False, False)
        
        # Center on parent
        x = self.dialog.winfo_x() + 100
        y = self.dialog.winfo_y() + 100
        details_window.geometry(f"600x400+{x}+{y}")
        
        # Make modal
        details_window.grab_set()
        
        # Main frame
        main_frame = ttk.Frame(details_window)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Title
        title_label = ttk.Label(main_frame, text="Trade Details", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 20))
        
        # Summary text
        summary = trade.get_summary()
        summary_text = tk.Text(main_frame, height=15, width=70, wrap=tk.WORD)
        summary_text.pack(fill=tk.BOTH, expand=True)
        summary_text.insert(tk.END, summary)
        summary_text.configure(state='disabled')  # Make read-only
        
        # Close button
        close_btn = ttk.Button(main_frame, text="Close", 
                              command=details_window.destroy)
        close_btn.pack(pady=(10, 0))
    
    def create_new_trade(self):
        """Open dialog to create a new trade"""
        self.dialog.destroy()  # Close this dialog
        
        # Open the regular trade creation dialog
        from trading import open_trading_dialog
        open_trading_dialog(self.parent, self.current_player, self.game.players, self.game)
    
    def center_dialog(self):
        """Center dialog on parent window"""
        self.dialog.update_idletasks()
        
        parent_x = self.parent.winfo_x()
        parent_y = self.parent.winfo_y()
        parent_width = self.parent.winfo_width()
        parent_height = self.parent.winfo_height()
        
        dialog_width = self.dialog.winfo_width()
        dialog_height = self.dialog.winfo_height()
        
        x = parent_x + (parent_width - dialog_width) // 2
        y = parent_y + (parent_height - dialog_height) // 2
        
        self.dialog.geometry(f"{dialog_width}x{dialog_height}+{x}+{y}")
