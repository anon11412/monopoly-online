"""
Property Trading System for Monopoly Game
Enhanced version with full control and human-to-human trading
"""

import tkinter as tk
from tkinter import ttk, messagebox
import time

class Trade:
    """Represents a trade proposal"""
    def __init__(self, proposer, recipient, offered_properties, requested_properties, offered_money, requested_money):
        self.proposer = proposer
        self.recipient = recipient
        self.offered_properties = offered_properties
        self.requested_properties = requested_properties
        self.offered_money = offered_money
        self.requested_money = requested_money
        self.timestamp = time.time()
        self.id = id(self)  # Unique ID for this trade
    
    def get_summary(self):
        """Get a summary string for this trade"""
        summary = f"From {self.proposer.name} to {self.recipient.name}:\n"
        if self.offered_properties:
            summary += f"Offering: {', '.join(prop.name for prop in self.offered_properties)}"
        if self.offered_money > 0:
            summary += f"{' + ' if self.offered_properties else 'Offering: '}${self.offered_money}"

        summary += "\nFor: "
        if self.requested_properties:
            summary += f"{', '.join(prop.name for prop in self.requested_properties)}"
        if self.requested_money > 0:
            summary += f"{' + ' if self.requested_properties else ''}${self.requested_money}"

        # Append advanced combined-trading terms if present
        if hasattr(self, 'function_blocks') and self.function_blocks:
            # Parse function blocks for advanced/combined trading
            payer = None
            amount = None
            turns = None
            parts = []
            for b in getattr(self, 'function_blocks', []):
                name = b.get('name')
                if name == 'Payer':
                    payer = b.get('value')
                elif name == 'Pay Money':
                    amount = b.get('value')
                elif name == 'For X Turns':
                    turns = b.get('value')
            if payer or amount or turns:
                summary += "\nAdvanced Terms: "
                if payer:
                    parts.append(f"Payer: {'Proposer' if payer=='proposer' else 'Partner'}")
                if amount is not None:
                    parts.append(f"Pay ${amount}")
                if turns is not None:
                    parts.append(f"for {turns} turns")
                summary += ', '.join(parts)
            # Also show any other blocks (for future extensibility)
            extra_blocks = [b for b in getattr(self, 'function_blocks', []) if b.get('name') not in ('Payer','Pay Money','For X Turns')]
            if extra_blocks:
                summary += "\nOther Terms: "
                for b in extra_blocks:
                    summary += f"\n  • {b.get('icon','')} {b.get('name','')}"
        return summary

class TradingDialog:
    def __init__(self, parent, current_player, all_players, game, selected_partner=None, negotiation_data=None):
        self.parent = parent
        self.current_player = current_player
        self.all_players = [p for p in all_players if p != current_player and not p.bankrupt]
        self.game = game  # Reference to game for pending trades
        self.selected_partner = selected_partner  # Pre-selected partner
        self.negotiation_data = negotiation_data  # Data from trade being negotiated
        
        self.dialog = tk.Toplevel(parent)
        self.dialog.title("Property Trading")
        self.dialog.geometry("900x700")
        self.dialog.configure(bg='#2c3e50')
        
        # Make dialog modal
        self.dialog.transient(parent)
        self.dialog.grab_set()
        
        # Don't override selected_partner if it was provided
        if not hasattr(self, 'selected_partner') or self.selected_partner is None:
            self.selected_partner = selected_partner
        
        self.offered_properties = []
        self.requested_properties = []
        self.offered_money = 0
        self.requested_money = 0
        
        # Variables to track selections
        self.offer_property_vars = []
        self.request_property_vars = []
        
        self.create_widgets()
        
        # If we have a pre-selected partner, set it up
        if self.selected_partner:
            self.setup_preselected_partner()
        
        # If we have negotiation data, pre-fill the form
        if self.negotiation_data:
            self.setup_negotiation_data()
        
        # Center the dialog
        self.center_dialog()
    
    def setup_negotiation_data(self):
        """Pre-fill the form with negotiation data (counter-offer)"""
        original_trade = self.negotiation_data
        
        # Switch the roles - what they offered becomes what we request, and vice versa
        # This creates a counter-offer based on the original trade
        
        # Pre-select properties for counter-offer
        # What they offered, we request
        if hasattr(self, 'request_property_vars'):
            for i, prop in enumerate(self.selected_partner.properties):
                if prop in original_trade.offered_properties:
                    if i < len(self.request_property_vars):
                        self.request_property_vars[i].set(True)
        
        # What they requested, we offer  
        if hasattr(self, 'offer_property_vars'):
            for i, prop in enumerate(self.current_player.properties):
                if prop in original_trade.requested_properties:
                    if i < len(self.offer_property_vars):
                        self.offer_property_vars[i].set(True)
        
        # Set money amounts (reversed)
        if hasattr(self, 'offer_money_var'):
            self.offer_money_var.set(original_trade.requested_money)
        if hasattr(self, 'request_money_var'):
            self.request_money_var.set(original_trade.offered_money)
        
        # Update the display
        self.on_property_selected()
        self.update_trade_summary()
    
    def setup_preselected_partner(self):
        """Setup the interface for a pre-selected partner"""
        # Populate request panel immediately
        self.populate_request_panel()
        # Update trade summary
        self.update_trade_summary()
        # Enable propose button
        if hasattr(self, 'propose_btn'):
            self.propose_btn.configure(state='normal')
        # Update selection label
        if hasattr(self, 'selection_label'):
            self.selection_label.configure(text=f"Trading with {self.selected_partner.name}")
    
    def center_dialog(self):
        """Center the dialog on the parent window"""
        self.dialog.update_idletasks()
        x = self.parent.winfo_x() + (self.parent.winfo_width() // 2) - (self.dialog.winfo_width() // 2)
        y = self.parent.winfo_y() + (self.parent.winfo_height() // 2) - (self.dialog.winfo_height() // 2)
        self.dialog.geometry(f"+{x}+{y}")
    
    def create_widgets(self):
        """Create enhanced trading dialog widgets with tabs"""
        main_frame = ttk.Frame(self.dialog)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=15, pady=15)
        
        # Create notebook for tabs
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=tk.BOTH, expand=True)
        
        # Tab 1: Create New Trade
        self.new_trade_frame = ttk.Frame(notebook)
        notebook.add(self.new_trade_frame, text="Create New Trade")
        
        # Tab 2: Pending Trades
        self.pending_trades_frame = ttk.Frame(notebook)
        notebook.add(self.pending_trades_frame, text="Pending Trades")
        
        # Setup both tabs
        self.setup_new_trade_tab()
        self.setup_pending_trades_tab()
    
    def setup_new_trade_tab(self):
        """Setup the new trade creation tab"""
        
        # Configure main grid
        self.new_trade_frame.grid_rowconfigure(1, weight=1)
        self.new_trade_frame.grid_columnconfigure(0, weight=1)
        
        # Title and partner selection
        header_frame = ttk.Frame(self.new_trade_frame)
        header_frame.grid(row=0, column=0, sticky='ew', pady=(0, 15))
        header_frame.grid_columnconfigure(1, weight=1)
        
        # Title
        title_label = ttk.Label(header_frame, text="🔄 Property Trading", 
                               font=('Arial', 16, 'bold'))
        title_label.grid(row=0, column=0, columnspan=3, pady=(0, 10))
        
        # Partner selection
        ttk.Label(header_frame, text="Trading Partner:", font=('Arial', 11)).grid(row=1, column=0, sticky='w')
        
        self.partner_var = tk.StringVar()
        partner_combo = ttk.Combobox(header_frame, textvariable=self.partner_var,
                                   values=[p.name for p in self.all_players],
                                   font=('Arial', 10), width=25, state='readonly' if self.selected_partner else 'normal')
        partner_combo.grid(row=1, column=1, sticky='ew', padx=(10, 0))
        partner_combo.bind('<<ComboboxSelected>>', self.on_partner_selected)
        
        # Set pre-selected partner if available
        if self.selected_partner:
            self.partner_var.set(self.selected_partner.name)
            partner_combo.configure(state='disabled')  # Lock the selection
        
        # Current selection display
        self.selection_label = ttk.Label(header_frame, text="Select a partner to begin trading",
                                       font=('Arial', 9), foreground='#7f8c8d')
        self.selection_label.grid(row=2, column=0, columnspan=3, pady=(5, 0))
        
        # Main trading area
        trade_container = ttk.Frame(self.new_trade_frame)
        trade_container.grid(row=1, column=0, sticky='nsew')
        trade_container.grid_columnconfigure(0, weight=1)
        trade_container.grid_columnconfigure(2, weight=1)
        trade_container.grid_rowconfigure(0, weight=1)
        
        # Your offer panel
        offer_frame = ttk.LabelFrame(trade_container, text=f"📤 {self.current_player.name}'s Offer", 
                                   padding=10)
        offer_frame.grid(row=0, column=0, sticky='nsew', padx=(0, 5))
        
        # Trading arrow
        arrow_frame = ttk.Frame(trade_container)
        arrow_frame.grid(row=0, column=1, sticky='ns', padx=10)
        ttk.Label(arrow_frame, text="⇄", font=('Arial', 24)).pack(expand=True)
        
        # Their offer panel
        request_frame = ttk.LabelFrame(trade_container, text="📥 Partner's Offer", 
                                     padding=10)
        request_frame.grid(row=0, column=2, sticky='nsew', padx=(5, 0))
        
        self.create_offer_panel(offer_frame, True)
        self.create_request_panel(request_frame)
        
        # Trade summary and buttons
        bottom_frame = ttk.Frame(self.new_trade_frame)
        bottom_frame.grid(row=2, column=0, sticky='ew', pady=(15, 0))
        bottom_frame.grid_columnconfigure(0, weight=1)
        
        # Trade summary
        self.summary_frame = ttk.LabelFrame(bottom_frame, text="📋 Trade Summary", padding=10)
        self.summary_frame.grid(row=0, column=0, sticky='ew', pady=(0, 10))
        
        self.summary_label = ttk.Label(self.summary_frame, 
                                     text="Configure your trade above to see summary",
                                     font=('Arial', 9), foreground='#7f8c8d')
        self.summary_label.pack()
        
        # Buttons
        button_frame = ttk.Frame(bottom_frame)
        button_frame.grid(row=1, column=0, sticky='ew')
        button_frame.grid_columnconfigure(1, weight=1)
        
        self.propose_btn = ttk.Button(button_frame, text="📨 Propose Trade", 
                                    command=self.propose_trade, state='disabled')
        self.propose_btn.grid(row=0, column=0, padx=(0, 10), sticky='w')
        
        self.clear_btn = ttk.Button(button_frame, text="🔄 Clear All", 
                                  command=self.clear_trade)
        self.clear_btn.grid(row=0, column=1, padx=5)
        
        ttk.Button(button_frame, text="❌ Cancel", 
                  command=self.dialog.destroy).grid(row=0, column=2, padx=(10, 0), sticky='e')
    
    def setup_pending_trades_tab(self):
        """Setup the pending trades viewing tab"""
        self.pending_trades_frame.grid_rowconfigure(0, weight=1)
        self.pending_trades_frame.grid_columnconfigure(0, weight=1)
        
        # Title
        title_label = ttk.Label(self.pending_trades_frame, 
                               text=f"📬 Pending Trades for {self.current_player.name}",
                               font=('Arial', 12, 'bold'))
        title_label.grid(row=0, column=0, pady=(0, 15), sticky='ew')
        
        # Scrollable frame for trades
        canvas = tk.Canvas(self.pending_trades_frame, bg='#34495e')
        scrollbar = ttk.Scrollbar(self.pending_trades_frame, orient="vertical", command=canvas.yview)
        self.pending_scrollable_frame = ttk.Frame(canvas)
        
        self.pending_scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=self.pending_scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.grid(row=1, column=0, sticky='nsew')
        scrollbar.grid(row=1, column=1, sticky='ns')
        
        # Refresh button
        refresh_btn = ttk.Button(self.pending_trades_frame, 
                                text="🔄 Refresh Pending Trades",
                                command=self.refresh_pending_trades)
        refresh_btn.grid(row=2, column=0, pady=(10, 0))
        
        # Initial load of pending trades
        self.refresh_pending_trades()
    
    def refresh_pending_trades(self):
        """Refresh the list of pending trades"""
        # Clear existing widgets
        for widget in self.pending_scrollable_frame.winfo_children():
            widget.destroy()
        
        # Get pending trades for current player
        pending_trades = self.game.get_pending_trades_for_player(self.current_player)
        
        if not pending_trades:
            no_trades_label = ttk.Label(self.pending_scrollable_frame,
                                       text="No pending trades",
                                       font=('Arial', 10),
                                       foreground='#7f8c8d')
            no_trades_label.pack(pady=20)
            return
        
        # Display each pending trade
        for i, trade in enumerate(pending_trades):
            trade_frame = ttk.LabelFrame(self.pending_scrollable_frame,
                                       text=f"Trade Proposal #{i+1}",
                                       padding=10)
            trade_frame.pack(fill='x', padx=10, pady=5)
            
            # Trade details
            details_label = ttk.Label(trade_frame,
                                    text=trade.get_summary(),
                                    justify='left')
            details_label.pack(anchor='w')
            
            # Action buttons
            button_frame = ttk.Frame(trade_frame)
            button_frame.pack(fill='x', pady=(10, 0))
            
            ttk.Button(button_frame, text="✅ Accept",
                      command=lambda t=trade: self.accept_pending_trade(t)).pack(side='left', padx=(0, 5))
            ttk.Button(button_frame, text="❌ Reject",
                      command=lambda t=trade: self.reject_pending_trade(t)).pack(side='left', padx=5)
            ttk.Button(button_frame, text="👁️ View Details",
                      command=lambda t=trade: self.view_trade_details(t)).pack(side='right')
    
    def accept_pending_trade(self, trade):
        """Accept a pending trade"""
        try:
            # Delegate to game.accept_trade so combined function blocks are activated
            self.game.accept_trade(trade)
            messagebox.showinfo("Trade Accepted", "Trade completed successfully!")
            self.refresh_pending_trades()
            # Update the main game display
            if hasattr(self.parent, 'update_display'):
                self.parent.update_display()
        except Exception as e:
            messagebox.showerror("Error", f"Trade failed: {str(e)}")
    
    def execute_trade_from_object(self, trade):
        """Execute a trade from a Trade object"""
        try:
            # Validate that the trade is still valid
            proposer = trade.proposer
            recipient = trade.recipient
            offered_props = trade.offered_properties
            requested_props = trade.requested_properties
            offered_money = trade.offered_money
            requested_money = trade.requested_money
            
            # Check money availability
            if offered_money > proposer.money:
                raise ValueError(f"{proposer.name} has insufficient money: need ${offered_money}, have ${proposer.money}")
            
            if requested_money > recipient.money:
                raise ValueError(f"{recipient.name} has insufficient money: need ${requested_money}, have ${recipient.money}")
            
            # Check property ownership
            for prop in offered_props:
                if prop.owner != proposer:
                    raise ValueError(f"{proposer.name} no longer owns {prop.name}")
                if hasattr(prop, 'mortgaged') and prop.mortgaged:
                    raise ValueError(f"{prop.name} is mortgaged and cannot be traded")
            
            for prop in requested_props:
                if prop.owner != recipient:
                    raise ValueError(f"{recipient.name} no longer owns {prop.name}")
                if hasattr(prop, 'mortgaged') and prop.mortgaged:
                    raise ValueError(f"{prop.name} is mortgaged and cannot be traded")
            
            # Execute the trade
            # Transfer properties from proposer to recipient
            for prop in offered_props:
                prop.owner = recipient
                proposer.properties.remove(prop)
                recipient.properties.append(prop)
            
            # Transfer properties from recipient to proposer
            for prop in requested_props:
                prop.owner = proposer
                recipient.properties.remove(prop)
                proposer.properties.append(prop)
            
            # Transfer money
            proposer.money -= offered_money
            recipient.money += offered_money
            recipient.money -= requested_money
            proposer.money += requested_money
            
            # Log the completed trade
            self.log_completed_trade(trade)
            
            return True
            
        except Exception as e:
            raise e
    
    def log_completed_trade(self, trade):
        """Log a completed trade to the game log with clickable details"""
        # Create a trade summary for the log
        summary = f"TRADE COMPLETED: {trade.proposer.name} ↔ {trade.recipient.name}"
        
        # Store trade history if not exists
        if not hasattr(self.game, 'trade_history'):
            self.game.trade_history = []
        
        # Add to trade history
        completed_trade = {
            'trade': trade,
            'timestamp': trade.timestamp,
            'completed_at': time.time(),
            'summary': summary
        }
        self.game.trade_history.append(completed_trade)
        
        # Add to GUI log (find GUI instance)
        try:
            # Look for GUI instance in parent widgets
            current = self.parent
            while current and not hasattr(current, 'add_log_message'):
                current = current.master
            
            if current and hasattr(current, 'add_log_message'):
                # Add clickable log entry
                current.add_clickable_log_message(summary, completed_trade)
            else:
                # Fallback to basic logging if GUI not found
                print(f"Trade completed: {summary}")
        except Exception as e:
            print(f"Error logging trade: {e}")
    
    def reject_pending_trade(self, trade):
        """Reject a pending trade"""
        self.game.remove_pending_trade(trade)
        messagebox.showinfo("Trade Rejected", f"Trade from {trade.proposer.name} has been rejected.")
        self.refresh_pending_trades()
    
    def view_trade_details(self, trade):
        """Show detailed view of a trade"""
        details_dialog = tk.Toplevel(self.dialog)
        details_dialog.title("Trade Details")
        details_dialog.geometry("400x300")
        details_dialog.configure(bg='#2c3e50')
        details_dialog.transient(self.dialog)
        details_dialog.grab_set()
        
        # Center the dialog
        details_dialog.update_idletasks()
        x = self.dialog.winfo_x() + (self.dialog.winfo_width() // 2) - (details_dialog.winfo_width() // 2)
        y = self.dialog.winfo_y() + (self.dialog.winfo_height() // 2) - (details_dialog.winfo_height() // 2)
        details_dialog.geometry(f"+{x}+{y}")
        
        main_frame = ttk.Frame(details_dialog)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Detailed trade information
        details_text = tk.Text(main_frame, wrap=tk.WORD, width=40, height=15)
        details_text.pack(fill=tk.BOTH, expand=True)
        
        trade_details = f"Trade Proposal from {trade.proposer.name}\n"
        trade_details += f"To: {trade.recipient.name}\n\n"
        
        trade_details += f"{trade.proposer.name} offers:\n"
        if trade.offered_properties:
            for prop in trade.offered_properties:
                trade_details += f"  • {prop.name} (${prop.price})\n"
        if trade.offered_money > 0:
            trade_details += f"  • ${trade.offered_money} cash\n"
        if not trade.offered_properties and trade.offered_money == 0:
            trade_details += "  • Nothing\n"
        
        trade_details += f"\n{trade.proposer.name} requests:\n"
        if trade.requested_properties:
            for prop in trade.requested_properties:
                trade_details += f"  • {prop.name} (${prop.price})\n"
        if trade.requested_money > 0:
            trade_details += f"  • ${trade.requested_money} cash\n"
        if not trade.requested_properties and trade.requested_money == 0:
            trade_details += "  • Nothing\n"
        
        offered_value = sum(prop.price for prop in trade.offered_properties) + trade.offered_money
        requested_value = sum(prop.price for prop in trade.requested_properties) + trade.requested_money
        trade_details += f"\nTotal Values:\n"
        trade_details += f"{trade.proposer.name} gives: ${offered_value}\n"
        trade_details += f"{trade.recipient.name} gives: ${requested_value}\n"
        
        details_text.insert(tk.END, trade_details)
        details_text.config(state=tk.DISABLED)
        
        # Close button
        ttk.Button(main_frame, text="Close", command=details_dialog.destroy).pack(pady=(10, 0))
    
    def create_offer_panel(self, parent, is_offering):
        """Create enhanced offer panel with checkboxes for better control"""
        parent.grid_rowconfigure(0, weight=1)
        parent.grid_columnconfigure(0, weight=1)
        
        # Properties section
        prop_frame = ttk.LabelFrame(parent, text="🏠 Properties to Offer")
        prop_frame.grid(row=0, column=0, sticky='nsew', pady=(0, 5))
        prop_frame.grid_rowconfigure(0, weight=1)
        prop_frame.grid_columnconfigure(0, weight=1)
        
        # Scrollable frame for properties
        canvas = tk.Canvas(prop_frame, height=150)
        scrollbar = ttk.Scrollbar(prop_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.grid(row=0, column=0, sticky='nsew', padx=5, pady=5)
        scrollbar.grid(row=0, column=1, sticky='ns')
        
        # Store references
        if is_offering:
            self.offer_canvas = canvas
            self.offer_scrollable_frame = scrollable_frame
            self.offer_property_vars = []
            
            # Populate with current player's properties
            if self.current_player.properties:
                for i, prop in enumerate(self.current_player.properties):
                    if not prop.mortgaged:
                        var = tk.BooleanVar()
                        self.offer_property_vars.append((var, prop))
                        
                        checkbox = ttk.Checkbutton(
                            scrollable_frame,
                            text=f"{prop.name} (${prop.price})",
                            variable=var,
                            command=self.update_trade_summary
                        )
                        checkbox.grid(row=i, column=0, sticky='w', padx=5, pady=2)
            else:
                ttk.Label(scrollable_frame, text="No properties to offer", 
                         foreground='#7f8c8d').grid(row=0, column=0, padx=5, pady=10)
        
        # Money section with slider and quick buttons
        money_frame = ttk.LabelFrame(parent, text="💰 Money to Offer")
        money_frame.grid(row=1, column=0, sticky='ew', pady=(5, 0))
        money_frame.grid_columnconfigure(2, weight=1)
        
        if is_offering:
            self.offer_money_var = tk.IntVar(value=0)
            
            # Amount label and entry
            ttk.Label(money_frame, text="Amount: $").grid(row=0, column=0, padx=(5, 0), pady=5)
            
            amount_entry = ttk.Entry(money_frame, textvariable=self.offer_money_var, width=10)
            amount_entry.grid(row=0, column=1, padx=5, pady=5)
            amount_entry.bind('<KeyRelease>', lambda e: self.update_trade_summary())
            
            # Slider
            max_money = self.current_player.money
            money_slider = ttk.Scale(money_frame, from_=0, to=max_money, 
                                   variable=self.offer_money_var, orient=tk.HORIZONTAL,
                                   command=lambda val: self.update_trade_summary())
            money_slider.grid(row=0, column=2, sticky='ew', padx=5, pady=5)
            
            # Quick amount buttons
            quick_frame = ttk.Frame(money_frame)
            quick_frame.grid(row=1, column=0, columnspan=3, pady=5, sticky='ew')
            
            quick_amounts = [0, 100, 500, 1000, max_money//4, max_money//2, max_money]
            quick_amounts = [amt for amt in quick_amounts if amt <= max_money and amt > 0]
            quick_amounts = sorted(list(set(quick_amounts)))  # Remove duplicates
            
            for i, amount in enumerate(quick_amounts):
                if amount == max_money:
                    text = "All"
                elif amount >= 1000:
                    text = f"${amount//1000}k"
                else:
                    text = f"${amount}"
                
                btn = ttk.Button(quick_frame, text=text, width=6,
                               command=lambda amt=amount: self.set_money_amount(amt, 'offer'))
                btn.grid(row=0, column=i, padx=2)
            
            # Show available money
            available_label = ttk.Label(money_frame, 
                                      text=f"Available: ${self.current_player.money}",
                                      font=('Arial', 8), foreground='#7f8c8d')
            available_label.grid(row=2, column=0, columnspan=3, pady=(0, 5))
    
    def set_money_amount(self, amount, money_type):
        """Set money amount for offer or request"""
        if money_type == 'offer':
            self.offer_money_var.set(amount)
        elif money_type == 'request' and hasattr(self, 'request_money_var'):
            self.request_money_var.set(amount)
        self.update_trade_summary()
    
    def create_request_panel(self, parent):
        """Create request panel for partner's offer"""
        parent.grid_rowconfigure(0, weight=1)
        parent.grid_columnconfigure(0, weight=1)
        
        # Initially show selection message
        self.request_content_frame = ttk.Frame(parent)
        self.request_content_frame.grid(row=0, column=0, sticky='nsew')
        
        self.no_partner_label = ttk.Label(self.request_content_frame,
                                        text="Select a trading partner\nto see their properties",
                                        font=('Arial', 10), foreground='#7f8c8d')
        self.no_partner_label.pack(expand=True)
    
    def populate_request_panel(self):
        """Populate the request panel with partner's properties"""
        # Clear existing content
        for widget in self.request_content_frame.winfo_children():
            widget.destroy()
        
        if not self.selected_partner:
            return
        
        # Properties section
        prop_frame = ttk.LabelFrame(self.request_content_frame, text="🏠 Properties to Request")
        prop_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 5))
        
        # Scrollable frame for partner's properties
        canvas = tk.Canvas(prop_frame, height=150)
        scrollbar = ttk.Scrollbar(prop_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5, pady=5)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Store references
        self.request_canvas = canvas
        self.request_scrollable_frame = scrollable_frame
        self.request_property_vars = []
        
        # Populate with partner's properties
        if self.selected_partner.properties:
            for i, prop in enumerate(self.selected_partner.properties):
                if not prop.mortgaged:
                    var = tk.BooleanVar()
                    self.request_property_vars.append((var, prop))
                    
                    checkbox = ttk.Checkbutton(
                        scrollable_frame,
                        text=f"{prop.name} (${prop.price})",
                        variable=var,
                        command=self.update_trade_summary
                    )
                    checkbox.grid(row=i, column=0, sticky='w', padx=5, pady=2)
        else:
            ttk.Label(scrollable_frame, text="No properties available", 
                     foreground='#7f8c8d').grid(row=0, column=0, padx=5, pady=10)
        
        # Money section with slider and quick buttons
        money_frame = ttk.LabelFrame(self.request_content_frame, text="💰 Money to Request")
        money_frame.pack(fill=tk.X, pady=(5, 0))
        
        money_entry_frame = ttk.Frame(money_frame)
        money_entry_frame.pack(fill=tk.X, padx=5, pady=5)
        money_entry_frame.grid_columnconfigure(2, weight=1)
        
        # Amount label and entry
        ttk.Label(money_entry_frame, text="Amount: $").grid(row=0, column=0)
        
        self.request_money_var = tk.IntVar(value=0)
        request_entry = ttk.Entry(money_entry_frame, textvariable=self.request_money_var, width=10)
        request_entry.grid(row=0, column=1, padx=5)
        request_entry.bind('<KeyRelease>', lambda e: self.update_trade_summary())
        
        # Slider
        max_money = self.selected_partner.money
        request_slider = ttk.Scale(money_entry_frame, from_=0, to=max_money, 
                                 variable=self.request_money_var, orient=tk.HORIZONTAL,
                                 command=lambda val: self.update_trade_summary())
        request_slider.grid(row=0, column=2, sticky='ew', padx=5)
        
        # Quick amount buttons
        quick_frame = ttk.Frame(money_frame)
        quick_frame.pack(fill=tk.X, pady=5)
        
        quick_amounts = [0, 100, 500, 1000, max_money//4, max_money//2, max_money]
        quick_amounts = [amt for amt in quick_amounts if amt <= max_money and amt > 0]
        quick_amounts = sorted(list(set(quick_amounts)))  # Remove duplicates
        
        for i, amount in enumerate(quick_amounts):
            if amount == max_money:
                text = "All"
            elif amount >= 1000:
                text = f"${amount//1000}k"
            else:
                text = f"${amount}"
            
            btn = ttk.Button(quick_frame, text=text, width=6,
                           command=lambda amt=amount: self.set_money_amount(amt, 'request'))
            btn.grid(row=0, column=i, padx=2)
        
        # Show available money
        available_label = ttk.Label(money_frame, 
                                  text=f"They have: ${self.selected_partner.money}",
                                  font=('Arial', 8), foreground='#7f8c8d')
        available_label.pack(pady=(0, 5))
        
        # Show available money
        available_label = ttk.Label(money_frame, 
                                  text=f"Available: ${self.selected_partner.money}",
                                  font=('Arial', 8), foreground='#7f8c8d')
        available_label.pack(pady=(0, 5))
    
    def on_partner_selected(self, event):
        """Handle partner selection"""
        partner_name = self.partner_var.get()
        self.selected_partner = next((p for p in self.all_players if p.name == partner_name), None)
        
        if self.selected_partner:
            # Update UI
            self.populate_request_panel()
            self.selection_label.config(text=f"Trading with: {self.selected_partner.name}")
            self.propose_btn.config(state='normal')
            
            # Update frame label
            for widget in self.dialog.winfo_children():
                if isinstance(widget, ttk.Frame):
                    for subwidget in widget.winfo_children():
                        if isinstance(subwidget, ttk.Frame):
                            for subsubwidget in subwidget.winfo_children():
                                if isinstance(subsubwidget, ttk.LabelFrame) and "Partner's Offer" in str(subsubwidget.cget('text')):
                                    subsubwidget.config(text=f"📥 {self.selected_partner.name}'s Offer")
            
            self.update_trade_summary()
        else:
            self.propose_btn.config(state='disabled')
    
    def update_trade_summary(self):
        """Update the trade summary display"""
        if not self.selected_partner:
            return
        
        # Get selected properties
        offered_props = [prop for var, prop in getattr(self, 'offer_property_vars', []) if var.get()]
        requested_props = [prop for var, prop in getattr(self, 'request_property_vars', []) if var.get()]
        
        # Get money amounts with better error handling
        try:
            offered_money = self.offer_money_var.get()
        except (ValueError, AttributeError):
            offered_money = 0
        
        try:
            requested_money = getattr(self, 'request_money_var', tk.IntVar(value=0)).get()
        except (ValueError, AttributeError):
            requested_money = 0
        
        # Build summary text
        summary_parts = []
        
        # Your offer
        your_offer = []
        if offered_props:
            prop_names = [prop.name for prop in offered_props]
            your_offer.append(f"Properties: {', '.join(prop_names)}")
        if offered_money > 0:
            your_offer.append(f"Money: ${offered_money}")
        
        if your_offer:
            summary_parts.append(f"You offer: {' + '.join(your_offer)}")
        else:
            summary_parts.append("You offer: Nothing")
        
        # Their offer
        their_offer = []
        if requested_props:
            prop_names = [prop.name for prop in requested_props]
            their_offer.append(f"Properties: {', '.join(prop_names)}")
        if requested_money > 0:
            their_offer.append(f"Money: ${requested_money}")
        
        if their_offer:
            summary_parts.append(f"You request: {' + '.join(their_offer)}")
        else:
            summary_parts.append("You request: Nothing")
        
        # Calculate values
        offered_value = sum(prop.price for prop in offered_props) + offered_money
        requested_value = sum(prop.price for prop in requested_props) + requested_money
        
        if offered_value > 0 or requested_value > 0:
            summary_parts.append(f"\nTrade Value: You give ${offered_value} ⇄ You get ${requested_value}")
            if offered_value != requested_value:
                diff = abs(offered_value - requested_value)
                if offered_value > requested_value:
                    summary_parts.append(f"(You give ${diff} more)")
                else:
                    summary_parts.append(f"(You get ${diff} more)")
        
        self.summary_label.config(text="\n".join(summary_parts))
    
    def clear_trade(self):
        """Clear all trade selections"""
        # Clear property selections
        for var, prop in getattr(self, 'offer_property_vars', []):
            var.set(False)
        for var, prop in getattr(self, 'request_property_vars', []):
            var.set(False)
        
        # Clear money entries
        if hasattr(self, 'offer_money_var'):
            self.offer_money_var.set("0")
        if hasattr(self, 'request_money_var'):
            self.request_money_var.set("0")
        
        self.update_trade_summary()
    
    def propose_trade(self):
        """Propose the trade with enhanced validation"""
        if not self.selected_partner:
            messagebox.showerror("Error", "Please select a trading partner")
            return
        
        # Get selected properties
        offered_props = [prop for var, prop in getattr(self, 'offer_property_vars', []) if var.get()]
        requested_props = [prop for var, prop in getattr(self, 'request_property_vars', []) if var.get()]
        
        # Get money amounts
        try:
            offered_money = self.offer_money_var.get()
            requested_money = getattr(self, 'request_money_var', tk.IntVar(value=0)).get()
        except ValueError:
            messagebox.showerror("Error", "Please enter valid money amounts (numbers only)")
            return
        
        # Validate trade has content
        if not offered_props and not requested_props and not offered_money and not requested_money:
            messagebox.showerror("Error", "Please select something to trade")
            return
        
        # Validate money amounts
        if offered_money > self.current_player.money:
            messagebox.showerror("Error", f"You don't have ${offered_money}. You only have ${self.current_player.money}")
            return
        
        if requested_money > self.selected_partner.money:
            messagebox.showerror("Error", f"{self.selected_partner.name} doesn't have ${requested_money}. They only have ${self.selected_partner.money}")
            return
        
        # Create and add trade to pending queue
        trade = Trade(self.current_player, self.selected_partner, 
                     offered_props, requested_props, offered_money, requested_money)
        self.game.add_pending_trade(trade)
        
        # Show confirmation
        messagebox.showinfo("Trade Sent", 
                           f"Trade proposal sent to {self.selected_partner.name}!\n"
                           f"They can view and respond to it in their Pending Trades tab.")
        
        # Clear the trade form
        self.clear_trade()
    
    def show_trade_proposal(self, offered_props, requested_props, offered_money, requested_money):
        """Show trade proposal to the partner for acceptance/rejection"""
        # Create trade proposal dialog
        proposal_dialog = tk.Toplevel(self.dialog)
        proposal_dialog.title("Trade Proposal")
        proposal_dialog.geometry("500x400")
        proposal_dialog.configure(bg='#2c3e50')
        proposal_dialog.transient(self.dialog)
        proposal_dialog.grab_set()
        
        # Center the proposal dialog
        proposal_dialog.update_idletasks()
        x = self.dialog.winfo_x() + (self.dialog.winfo_width() // 2) - (proposal_dialog.winfo_width() // 2)
        y = self.dialog.winfo_y() + (self.dialog.winfo_height() // 2) - (proposal_dialog.winfo_height() // 2)
        proposal_dialog.geometry(f"+{x}+{y}")
        
        main_frame = ttk.Frame(proposal_dialog)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Title
        title_label = ttk.Label(main_frame, text="🔔 Trade Proposal", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 15))
        
        # From/To
        from_to_frame = ttk.Frame(main_frame)
        from_to_frame.pack(fill=tk.X, pady=(0, 15))
        
        ttk.Label(from_to_frame, text=f"From: {self.current_player.name}", 
                 font=('Arial', 12, 'bold')).pack(anchor=tk.W)
        ttk.Label(from_to_frame, text=f"To: {self.selected_partner.name}", 
                 font=('Arial', 12, 'bold')).pack(anchor=tk.W)
        
        # Trade details
        details_frame = ttk.LabelFrame(main_frame, text="Trade Details", padding=10)
        details_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 15))
        
        # Build detailed description
        details_text = tk.Text(details_frame, height=12, wrap=tk.WORD, 
                              bg='#34495e', fg='#ecf0f1', font=('Arial', 10))
        details_scrollbar = ttk.Scrollbar(details_frame, orient="vertical", command=details_text.yview)
        details_text.configure(yscrollcommand=details_scrollbar.set)
        
        details_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        details_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Format trade details
        trade_details = f"{self.current_player.name} offers:\n"
        if offered_props:
            trade_details += "Properties:\n"
            for prop in offered_props:
                trade_details += f"  • {prop.name} (${prop.price})\n"
        if offered_money > 0:
            trade_details += f"Money: ${offered_money}\n"
        if not offered_props and offered_money == 0:
            trade_details += "Nothing\n"
        
        trade_details += f"\nIn exchange for:\n"
        if requested_props:
            trade_details += "Properties:\n"
            for prop in requested_props:
                trade_details += f"  • {prop.name} (${prop.price})\n"
        if requested_money > 0:
            trade_details += f"Money: ${requested_money}\n"
        if not requested_props and requested_money == 0:
            trade_details += "Nothing\n"
        
        # Add value summary
        offered_value = sum(prop.price for prop in offered_props) + offered_money
        requested_value = sum(prop.price for prop in requested_props) + requested_money
        trade_details += f"\nTotal Values:\n"
        trade_details += f"{self.current_player.name} gives: ${offered_value}\n"
        trade_details += f"{self.selected_partner.name} gives: ${requested_value}\n"
        
        details_text.insert(tk.END, trade_details)
        details_text.config(state=tk.DISABLED)
        
        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill=tk.X)
        
        def accept_trade():
            try:
                success = self.execute_trade(offered_props, requested_props, offered_money, requested_money)
                if success:
                    messagebox.showinfo("Trade Accepted", "Trade completed successfully!")
                    proposal_dialog.destroy()
                    self.dialog.destroy()
                else:
                    messagebox.showerror("Trade Failed", "Trade could not be completed.")
            except Exception as e:
                messagebox.showerror("Error", f"Trade failed: {str(e)}")
        
        def reject_trade():
            messagebox.showinfo("Trade Rejected", f"{self.selected_partner.name} rejected the trade.")
            proposal_dialog.destroy()
        
        ttk.Button(button_frame, text="✅ Accept Trade", 
                  command=accept_trade).pack(side=tk.LEFT, padx=(0, 10))
        ttk.Button(button_frame, text="❌ Reject Trade", 
                  command=reject_trade).pack(side=tk.LEFT, padx=10)
        ttk.Button(button_frame, text="📝 Modify Trade", 
                  command=proposal_dialog.destroy).pack(side=tk.RIGHT)
    
    def execute_trade(self, offered_props, requested_props, offered_money, requested_money):
        """Execute the actual trade with detailed validation"""
        try:
            # Double-check all validations
            if offered_money > self.current_player.money:
                raise ValueError(f"Insufficient money: need ${offered_money}, have ${self.current_player.money}")
            
            if requested_money > self.selected_partner.money:
                raise ValueError(f"Partner has insufficient money: need ${requested_money}, have ${self.selected_partner.money}")
            
            # Check property ownership
            for prop in offered_props:
                if prop.owner != self.current_player:
                    raise ValueError(f"You don't own {prop.name}")
                if prop.mortgaged:
                    raise ValueError(f"{prop.name} is mortgaged and cannot be traded")
            
            for prop in requested_props:
                if prop.owner != self.selected_partner:
                    raise ValueError(f"{self.selected_partner.name} doesn't own {prop.name}")
                if prop.mortgaged:
                    raise ValueError(f"{prop.name} is mortgaged and cannot be traded")
            
            # Execute the trade
            # Transfer properties from current player to partner
            for prop in offered_props:
                prop.owner = self.selected_partner
                self.current_player.properties.remove(prop)
                self.selected_partner.properties.append(prop)
            
            # Transfer properties from partner to current player
            for prop in requested_props:
                prop.owner = self.current_player
                self.selected_partner.properties.remove(prop)
                self.current_player.properties.append(prop)
            
            # Transfer money
            self.current_player.money -= offered_money
            self.current_player.money += requested_money
            self.selected_partner.money += offered_money
            self.selected_partner.money -= requested_money
            
            return True
        except Exception as e:
            messagebox.showerror("Trade Error", f"Trade failed: {str(e)}")
            return False

def open_trading_dialog(parent, current_player, all_players, game):
    """Open the enhanced trading dialog with pending trades system"""
    available_players = [p for p in all_players if p != current_player and not p.bankrupt]
    
    if len(available_players) == 0:
        messagebox.showinfo("Trading", "No other players available for trading!")
        return
    
    # First show player selection dialog
    player_dialog = PlayerSelectionDialog(parent, current_player, available_players, game)
    return player_dialog

class PlayerSelectionDialog:
    """Dialog for selecting trading partner or viewing pending trades"""
    def __init__(self, parent, current_player, available_players, game):
        self.parent = parent
        self.current_player = current_player
        self.available_players = available_players
        self.game = game
        
        self.dialog = tk.Toplevel(parent)
        self.dialog.title("Trading Options")
        self.dialog.geometry("400x500")
        self.dialog.configure(bg='#2c3e50')
        
        # Make dialog modal
        self.dialog.transient(parent)
        self.dialog.grab_set()
        
        self.create_widgets()
        self.center_dialog()
    
    def center_dialog(self):
        """Center the dialog on the parent window"""
        self.dialog.update_idletasks()
        x = self.parent.winfo_x() + (self.parent.winfo_width() // 2) - (self.dialog.winfo_width() // 2)
        y = self.parent.winfo_y() + (self.parent.winfo_height() // 2) - (self.dialog.winfo_height() // 2)
        self.dialog.geometry(f"+{x}+{y}")
    
    def create_widgets(self):
        """Create player selection widgets"""
        main_frame = ttk.Frame(self.dialog)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Title
        title_label = ttk.Label(main_frame, text="Trading Options", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 20))
        
        # Check for pending trades
        pending_count = len(self.game.get_pending_trades_for_player(self.current_player))
        
        # Pending trades section
        if pending_count > 0:
            pending_frame = ttk.LabelFrame(main_frame, text=f"📬 You have {pending_count} pending trade(s)!", padding=15)
            pending_frame.pack(fill='x', pady=(0, 20))
            
            ttk.Label(pending_frame, text=f"You have {pending_count} trade proposal(s) waiting for your response.",
                     wraplength=350).pack(pady=(0, 10))
            
            ttk.Button(pending_frame, text="🔍 View Pending Trades",
                      command=self.open_pending_trades).pack()
        
        # New trade section
        new_trade_frame = ttk.LabelFrame(main_frame, text="📤 Create New Trade", padding=15)
        new_trade_frame.pack(fill='both', expand=True)
        
        ttk.Label(new_trade_frame, text="Select a player to trade with:",
                 font=('Arial', 12)).pack(pady=(0, 10))
        
        # Player selection buttons
        for player in self.available_players:
            player_frame = ttk.Frame(new_trade_frame)
            player_frame.pack(fill='x', pady=5)
            
            # Player info
            info_text = f"{player.name} - ${player.money}"
            if player.properties:
                info_text += f" - {len(player.properties)} properties"
            
            ttk.Button(player_frame, text=info_text,
                      command=lambda p=player: self.select_player(p)).pack(fill='x')
        
        # Cancel button
        ttk.Button(main_frame, text="❌ Cancel",
                  command=self.dialog.destroy).pack(pady=(20, 0))
    
    def select_player(self, selected_player):
        """Open trading dialog with selected player"""
        self.dialog.destroy()
        TradingDialog(self.parent, self.current_player, [selected_player], self.game, selected_player)
    
    def open_pending_trades(self):
        """Open pending trades only view"""
        self.dialog.destroy()
        PendingTradesOnlyDialog(self.parent, self.current_player, self.game)

class GlobalPendingTradesDialog:
    """Global dialog for viewing all pending trades"""
    def __init__(self, parent, current_player, all_players, game):
        self.parent = parent
        self.current_player = current_player
        self.all_players = all_players
        self.game = game
        
        self.dialog = tk.Toplevel(parent)
        self.dialog.title("All Pending Trades")
        self.dialog.geometry("800x600")
        self.dialog.configure(bg='#2c3e50')
        
        # Make dialog modal
        self.dialog.transient(parent)
        self.dialog.grab_set()
        
        self.setup_global_trades_view()
        self.center_dialog()
    
    def center_dialog(self):
        """Center the dialog on the parent window"""
        self.dialog.update_idletasks()
        x = self.parent.winfo_x() + (self.parent.winfo_width() // 2) - (self.dialog.winfo_width() // 2)
        y = self.parent.winfo_y() + (self.parent.winfo_height() // 2) - (self.dialog.winfo_height() // 2)
        self.dialog.geometry(f"+{x}+{y}")
    
    def setup_global_trades_view(self):
        """Setup the global pending trades viewing interface"""
        main_frame = ttk.Frame(self.dialog)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=15, pady=15)
        
        # Title
        title_label = ttk.Label(main_frame, 
                               text="🌍 All Pending Trades",
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 15))
        
        # Tab system for different views
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=tk.BOTH, expand=True)
        
        # Tab 1: Trades involving current player
        self.my_trades_frame = ttk.Frame(notebook)
        notebook.add(self.my_trades_frame, text=f"My Trades ({self.current_player.name})")
        
        # Tab 2: All other trades (public view)
        self.all_trades_frame = ttk.Frame(notebook)
        notebook.add(self.all_trades_frame, text="Other Players' Trades")
        
        # Setup both tabs
        self.setup_my_trades_tab()
        self.setup_all_trades_tab()
        
        # Bottom buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill='x', pady=(10, 0))
        
        ttk.Button(button_frame, text="🔄 Refresh", 
                  command=self.refresh_all_trades).pack(side='left')
        ttk.Button(button_frame, text="📝 Create New Trade", 
                  command=self.create_new_trade).pack(side='left', padx=(10, 0))
        ttk.Button(button_frame, text="❌ Close", 
                  command=self.dialog.destroy).pack(side='right')
    
    def setup_my_trades_tab(self):
        """Setup the tab for trades involving current player"""
        # Scrollable frame
        canvas = tk.Canvas(self.my_trades_frame, bg='#34495e')
        scrollbar = ttk.Scrollbar(self.my_trades_frame, orient="vertical", command=canvas.yview)
        self.my_trades_scrollable = ttk.Frame(canvas)
        
        self.my_trades_scrollable.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=self.my_trades_scrollable, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')
    
    def setup_all_trades_tab(self):
        """Setup the tab for all trades between other players"""
        # Scrollable frame
        canvas = tk.Canvas(self.all_trades_frame, bg='#34495e')
        scrollbar = ttk.Scrollbar(self.all_trades_frame, orient="vertical", command=canvas.yview)
        self.all_trades_scrollable = ttk.Frame(canvas)
        
        self.all_trades_scrollable.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=self.all_trades_scrollable, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')
    
    def refresh_all_trades(self):
        """Refresh all trade displays"""
        self.refresh_my_trades()
        self.refresh_other_trades()
    
    def refresh_my_trades(self):
        """Refresh trades involving current player"""
        # Clear existing widgets
        for widget in self.my_trades_scrollable.winfo_children():
            widget.destroy()
        
        # Get all pending trades
        all_pending = []
        for player in self.all_players:
            all_pending.extend(self.game.get_pending_trades_for_player(player))
        
        # Filter for trades involving current player
        my_trades = [trade for trade in all_pending 
                    if trade.proposer == self.current_player or trade.recipient == self.current_player]
        
        if not my_trades:
            no_trades_label = ttk.Label(self.my_trades_scrollable,
                                       text="No pending trades involving you",
                                       font=('Arial', 12))
            no_trades_label.pack(pady=20)
            return
        
        for trade in my_trades:
            self.create_trade_widget(self.my_trades_scrollable, trade, is_mine=True)
    
    def refresh_other_trades(self):
        """Refresh trades between other players"""
        # Clear existing widgets
        for widget in self.all_trades_scrollable.winfo_children():
            widget.destroy()
        
        # Get all pending trades
        all_pending = []
        for player in self.all_players:
            all_pending.extend(self.game.get_pending_trades_for_player(player))
        
        # Filter for trades NOT involving current player
        other_trades = [trade for trade in all_pending 
                       if trade.proposer != self.current_player and trade.recipient != self.current_player]
        
        if not other_trades:
            no_trades_label = ttk.Label(self.all_trades_scrollable,
                                       text="No pending trades between other players",
                                       font=('Arial', 12))
            no_trades_label.pack(pady=20)
            return
        
        for trade in other_trades:
            self.create_trade_widget(self.all_trades_scrollable, trade, is_mine=False)
    
    def create_trade_widget(self, parent, trade, is_mine=True):
        """Create a widget displaying trade information"""
        trade_frame = ttk.LabelFrame(parent, text=f"Trade #{trade.id % 1000}", padding=10)
        trade_frame.pack(fill='x', padx=5, pady=5)
        
        # Trade summary
        summary_label = ttk.Label(trade_frame, text=trade.get_summary(), 
                                 font=('Arial', 10), justify=tk.LEFT)
        summary_label.pack(anchor='w')
        
        # Timestamp
        import datetime
        timestamp = datetime.datetime.fromtimestamp(trade.timestamp).strftime("%H:%M:%S")
        time_label = ttk.Label(trade_frame, text=f"Proposed at: {timestamp}", 
                              font=('Arial', 9), foreground='gray')
        time_label.pack(anchor='w', pady=(5, 0))
        
        # Action buttons (only for trades involving current player)
        if is_mine:
            button_frame = ttk.Frame(trade_frame)
            button_frame.pack(fill='x', pady=(10, 0))
            
            if trade.recipient == self.current_player:
                # Current player can accept/reject
                ttk.Button(button_frame, text="✅ Accept", 
                          command=lambda t=trade: self.accept_trade(t)).pack(side='left', padx=(0, 5))
                ttk.Button(button_frame, text="❌ Reject", 
                          command=lambda t=trade: self.reject_trade(t)).pack(side='left', padx=(0, 5))
                ttk.Button(button_frame, text="💬 Negotiate", 
                          command=lambda t=trade: self.negotiate_trade(t)).pack(side='left', padx=(0, 5))
            else:
                # Current player proposed this trade
                ttk.Button(button_frame, text="🗑️ Withdraw", 
                          command=lambda t=trade: self.withdraw_trade(t)).pack(side='left')
        else:
            # Read-only view for other players' trades
            status_label = ttk.Label(trade_frame, text="(Observing)", 
                                   font=('Arial', 9), foreground='lightblue')
            status_label.pack(anchor='e', pady=(5, 0))
    
    def accept_trade(self, trade):
        """Accept a trade proposal"""
        try:
            from . import gui
            gui_instance = None
            # Find GUI instance to call execute_trade_from_object
            for widget in self.parent.winfo_children():
                if hasattr(widget, 'execute_trade_from_object'):
                    gui_instance = widget
                    break
            
            if gui_instance:
                success = gui_instance.execute_trade_from_object(trade)
                if success:
                    self.game.remove_pending_trade(trade)
                    self.refresh_all_trades()
                    messagebox.showinfo("Trade Completed", "Trade executed successfully!")
                else:
                    messagebox.showerror("Trade Failed", "Trade could not be completed.")
        except Exception as e:
            messagebox.showerror("Error", f"Error executing trade: {str(e)}")
    
    def reject_trade(self, trade):
        """Reject a trade proposal"""
        self.game.remove_pending_trade(trade)
        self.refresh_all_trades()
        messagebox.showinfo("Trade Rejected", f"Trade from {trade.proposer.name} has been rejected.")
    
    def withdraw_trade(self, trade):
        """Withdraw a trade proposal"""
        self.game.remove_pending_trade(trade)
        self.refresh_all_trades()
        messagebox.showinfo("Trade Withdrawn", "Your trade proposal has been withdrawn.")
    
    def negotiate_trade(self, trade):
        """Open negotiation dialog"""
        # Close this dialog and open trading dialog with pre-filled counter-offer
        self.dialog.destroy()
        TradingDialog(self.parent, self.current_player, self.all_players, self.game, 
                     selected_partner=trade.proposer, negotiation_data=trade)
    
    def create_new_trade(self):
        """Create a new trade"""
        self.dialog.destroy()
        TradingDialog(self.parent, self.current_player, self.all_players, self.game)

class PendingTradesOnlyDialog:
    """Simplified dialog for viewing only pending trades"""
    def __init__(self, parent, current_player, game):
        self.parent = parent
        self.current_player = current_player
        self.game = game
        
        self.dialog = tk.Toplevel(parent)
        self.dialog.title("Pending Trades")
        self.dialog.geometry("600x500")
        self.dialog.configure(bg='#2c3e50')
        
        # Make dialog modal
        self.dialog.transient(parent)
        self.dialog.grab_set()
        
        self.setup_pending_trades()
        self.center_dialog()
    
    def center_dialog(self):
        """Center the dialog on the parent window"""
        self.dialog.update_idletasks()
        x = self.parent.winfo_x() + (self.parent.winfo_width() // 2) - (self.dialog.winfo_width() // 2)
        y = self.parent.winfo_y() + (self.parent.winfo_height() // 2) - (self.dialog.winfo_height() // 2)
        self.dialog.geometry(f"+{x}+{y}")
    
    def setup_pending_trades(self):
        """Setup the pending trades viewing interface"""
        main_frame = ttk.Frame(self.dialog)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=15, pady=15)
        
        # Title
        title_label = ttk.Label(main_frame, 
                               text=f"📬 Pending Trades for {self.current_player.name}",
                               font=('Arial', 14, 'bold'))
        title_label.pack(pady=(0, 15))
        
        # Scrollable frame for trades
        canvas = tk.Canvas(main_frame, bg='#34495e')
        scrollbar = ttk.Scrollbar(main_frame, orient="vertical", command=canvas.yview)
        self.scrollable_frame = ttk.Frame(canvas)
        
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')
        
        # Bottom buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill='x', pady=(10, 0))
        
        ttk.Button(button_frame, text="🔄 Refresh", 
                  command=self.refresh_pending_trades).pack(side='left')
        ttk.Button(button_frame, text="❌ Close", 
                  command=self.dialog.destroy).pack(side='right')
        
        # Load pending trades
        self.refresh_pending_trades()
    
    def refresh_pending_trades(self):
        """Refresh the list of pending trades"""
        # Clear existing widgets
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()
        
        # Get pending trades for current player
        pending_trades = self.game.get_pending_trades_for_player(self.current_player)
        
        if not pending_trades:
            no_trades_label = ttk.Label(self.scrollable_frame,
                                       text="No pending trades",
                                       font=('Arial', 12),
                                       foreground='#7f8c8d')
            no_trades_label.pack(pady=20)
            return
        
        # Display each pending trade
        for i, trade in enumerate(pending_trades):
            self.create_trade_widget(trade, i+1)
    
    def create_trade_widget(self, trade, index):
        """Create a widget for a single trade"""
        trade_frame = ttk.LabelFrame(self.scrollable_frame,
                                   text=f"Trade Proposal #{index}",
                                   padding=10)
        trade_frame.pack(fill='x', padx=10, pady=5)
        
        # Trade details
        details_label = ttk.Label(trade_frame,
                                text=trade.get_summary(),
                                justify='left')
        details_label.pack(anchor='w')
        
        # Action buttons
        button_frame = ttk.Frame(trade_frame)
        button_frame.pack(fill='x', pady=(10, 0))
        
        ttk.Button(button_frame, text="✅ Accept",
                  command=lambda t=trade: self.accept_trade(t)).pack(side='left', padx=(0, 5))
        ttk.Button(button_frame, text="❌ Reject",
                  command=lambda t=trade: self.reject_trade(t)).pack(side='left', padx=5)
        ttk.Button(button_frame, text="👁️ Details",
                  command=lambda t=trade: self.view_details(t)).pack(side='right')
    
    def accept_trade(self, trade):
        """Accept a pending trade"""
        try:
            # Create a temporary trading dialog to use its execute method
            temp_dialog = TradingDialog(self.parent, self.current_player, [], self.game)
            success = temp_dialog.execute_trade_from_object(trade)
            
            if success:
                self.game.remove_pending_trade(trade)
                messagebox.showinfo("Trade Accepted", "Trade completed successfully!")
                self.refresh_pending_trades()
                # Update main game display if possible
                if hasattr(self.parent, 'update_display'):
                    self.parent.update_display()
            
        except Exception as e:
            messagebox.showerror("Error", f"Trade failed: {str(e)}")
    
    def reject_trade(self, trade):
        """Reject a pending trade"""
        self.game.remove_pending_trade(trade)
        messagebox.showinfo("Trade Rejected", f"Trade from {trade.proposer.name} has been rejected.")
        self.refresh_pending_trades()
    
    def view_details(self, trade):
        """Show detailed view of a trade"""
        # Use the same detailed view from TradingDialog
        temp_dialog = TradingDialog(self.parent, self.current_player, [], self.game)
        temp_dialog.view_trade_details(trade)
