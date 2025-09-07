"""
Combined Trading System - Merges Traditional and Advanced Function Blocks
Provides both standard property/money trading and visual programming blocks
"""

import tkinter as tk
from tkinter import ttk, messagebox
import time
from trading import Trade

class CombinedTradingDialog:
    def get_available_blocks(self):
        """Get the available blocks list"""
        return [
            {"type": "action", "name": "Pay Money", "description": "Transfer money between players", "variable": "amount", "default": 100, "icon": "💰"},
            {"type": "timing", "name": "For X Turns", "description": "Repeat each time it's the payer's turn (rounds)", "variable": "turns", "default": 5, "icon": "🔢"},
            # Optional timing flag; kept for backward compatibility but not required for per-round behavior
            {"type": "timing", "name": "Every Turn", "description": "(Optional) Legacy: execute every player's turn — not needed; payments run on payer's turns.", "icon": "⏰"},
        ]

    def __init__(self, parent, current_player, all_players, game):
        print("🔧 Creating CombinedTradingDialog...")  # Debug output
        print(f"   Available blocks: {len(self.get_available_blocks())}")  # Debug blocks count
        self.parent = parent
        self.current_player = current_player
        self.all_players = [p for p in all_players if p != current_player and not p.bankrupt]
        self.game = game

        self.dialog = tk.Toplevel(parent)
        self.dialog.title("Combined Trading System")
        self.dialog.geometry("1200x800")
        self.dialog.configure(bg='#2c3e50')

        # Make dialog modal
        self.dialog.transient(parent)
        self.dialog.grab_set()

        # Trade state
        self.selected_partner = None

        # Traditional trading variables
        self.offer_property_vars = []
        self.request_property_vars = []
        self.offer_money_var = tk.IntVar(value=0)
        self.request_money_var = tk.IntVar(value=0)

        # Function selection state (checkbox UX)
        self.function_blocks = []  # built at propose time from selections
        self.available_blocks = self.get_available_blocks()
        self.cb_pay_money_var = tk.BooleanVar(value=False)
        self.cb_for_turns_var = tk.BooleanVar(value=False)
        self.cb_every_turn_var = tk.BooleanVar(value=False)  # optional/legacy
        # Use StringVar + robust parsing to allow inputs like "1,000"
        self.pay_amount_var = tk.StringVar(value="100")
        self.turns_var = tk.StringVar(value="5")

        self.create_widgets()
        self.center_dialog()

    def center_dialog(self):
        """Center the dialog on the parent window"""
        self.dialog.update_idletasks()
        x = self.parent.winfo_x() + (self.parent.winfo_width() // 2) - (self.dialog.winfo_width() // 2)
        y = self.parent.winfo_y() + (self.parent.winfo_height() // 2) - (self.dialog.winfo_height() // 2)
        self.dialog.geometry(f"+{x}+{y}")

    def create_widgets(self):
        """Create the combined interface"""
        main_frame = ttk.Frame(self.dialog)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=15, pady=15)
        
        # Title
        title_label = ttk.Label(main_frame, text="🔄⚡ Combined Trading System", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 15))
        
        # Partner selection (always visible at top)
        header_frame = ttk.Frame(main_frame)
        header_frame.pack(fill=tk.X, pady=(0, 15))
        
        ttk.Label(header_frame, text="Trading Partner:", font=('Arial', 11)).pack(side=tk.LEFT)
        self.partner_var = tk.StringVar()
        partner_combo = ttk.Combobox(header_frame, textvariable=self.partner_var,
                                   values=[p.name for p in self.all_players],
                                   font=('Arial', 10), width=25, state='readonly')
        partner_combo.pack(side=tk.LEFT, padx=(10, 0))
        partner_combo.bind('<<ComboboxSelected>>', self.on_partner_selected)
        
        self.selection_label = ttk.Label(header_frame, text="Select a partner to begin trading",
                                       font=('Arial', 9), foreground='#7f8c8d')
        self.selection_label.pack(side=tk.RIGHT)
        
        # Create notebook for tabs
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=tk.BOTH, expand=True)
        
        # Tab 1: Traditional Trading
        self.traditional_frame = ttk.Frame(notebook)
        notebook.add(self.traditional_frame, text="Traditional Trading")
        
        # Tab 2: Function Blocks
        self.blocks_frame = ttk.Frame(notebook)
        notebook.add(self.blocks_frame, text="Function Blocks")
        
        # Tab 3: Trade Summary
        self.summary_frame = ttk.Frame(notebook)
        notebook.add(self.summary_frame, text="Trade Summary & Propose")
        
        self.setup_traditional_tab()
        self.setup_blocks_tab()
        self.setup_summary_tab()

    def _parse_positive_int(self, text, field_name, allow_zero=False):
        """Parse a positive integer from text, allowing commas and $ signs.
        Returns (ok, value_or_msg). If ok is False, value_or_msg is error message.
        """
        if text is None:
            return (False, f"Please enter a value for {field_name}.")
        s = str(text).strip()
        if not s:
            return (False, f"Please enter a value for {field_name}.")
        # Remove common formatting
        s = s.replace(',', '').replace('$', '').replace(' ', '')
        try:
            val = int(s)
        except ValueError:
            return (False, f"'{text}' is not a valid number for {field_name}.")
        if allow_zero:
            if val < 0:
                return (False, f"{field_name} cannot be negative.")
        else:
            if val <= 0:
                return (False, f"{field_name} must be greater than 0.")
        return (True, val)
    
    def setup_traditional_tab(self):
        """Setup traditional trading interface with properties and money"""
        self.traditional_frame.grid_rowconfigure(0, weight=1)
        self.traditional_frame.grid_columnconfigure(0, weight=1)
        self.traditional_frame.grid_columnconfigure(2, weight=1)
        
        # Your offer panel
        offer_frame = ttk.LabelFrame(self.traditional_frame, text=f"📤 {self.current_player.name}'s Offer", 
                                   padding=10)
        offer_frame.grid(row=0, column=0, sticky='nsew', padx=(0, 5))
        
        # Trading arrow
        arrow_frame = ttk.Frame(self.traditional_frame)
        arrow_frame.grid(row=0, column=1, sticky='ns', padx=10)
        ttk.Label(arrow_frame, text="⇄", font=('Arial', 24)).pack(expand=True)
        
        # Their offer panel
        request_frame = ttk.LabelFrame(self.traditional_frame, text="📥 Partner's Offer", 
                                     padding=10)
        request_frame.grid(row=0, column=2, sticky='nsew', padx=(5, 0))
        
        self.create_offer_panel(offer_frame)
        self.create_request_panel(request_frame)
    
    def create_offer_panel(self, parent):
        """Create offer panel with properties and money"""
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
        
        # Populate with current player's properties
        self.offer_property_vars = []
        if self.current_player.properties:
            for i, prop in enumerate(self.current_player.properties):
                if not getattr(prop, 'mortgaged', False):
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
        
        # Money section
        money_frame = ttk.LabelFrame(parent, text="💰 Money to Offer")
        money_frame.grid(row=1, column=0, sticky='ew', pady=(5, 0))
        money_frame.grid_columnconfigure(2, weight=1)
        
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
        quick_amounts = sorted(list(set(quick_amounts)))
        
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
    
    def create_request_panel(self, parent):
        """Create request panel for partner's properties and money"""
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
        
        # Populate with partner's properties
        self.request_property_vars = []
        if self.selected_partner.properties:
            for i, prop in enumerate(self.selected_partner.properties):
                if not getattr(prop, 'mortgaged', False):
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
        
        # Money section
        money_frame = ttk.LabelFrame(self.request_content_frame, text="💰 Money to Request")
        money_frame.pack(fill=tk.X, pady=(5, 0))
        
        money_entry_frame = ttk.Frame(money_frame)
        money_entry_frame.pack(fill=tk.X, padx=5, pady=5)
        money_entry_frame.grid_columnconfigure(2, weight=1)
        
        # Amount label and entry
        ttk.Label(money_entry_frame, text="Amount: $").grid(row=0, column=0)
        
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
        quick_amounts = sorted(list(set(quick_amounts)))
        
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
                                  text=f"Available: ${self.selected_partner.money}",
                                  font=('Arial', 8), foreground='#7f8c8d')
        available_label.pack(pady=(0, 5))
    
    def setup_blocks_tab(self):
        """Setup function blocks interface with simple checkboxes and inputs"""
        self.blocks_frame.grid_rowconfigure(0, weight=1)
        self.blocks_frame.grid_columnconfigure(0, weight=1)

        container = ttk.Frame(self.blocks_frame)
        container.grid(row=0, column=0, sticky='nsew')
        container.grid_columnconfigure(0, weight=1)

        # Info / guidance
        note = ttk.Label(
            container,
            text=(
                "Select the functions to include in this deal.\n"
                "Note: 'Turns' means payer rounds — the payment runs at the start of the payer's turn."
            ),
            foreground='#7f8c8d'
        )
        note.grid(row=0, column=0, sticky='w', pady=(0, 10))

        # Functions section with checkboxes
        funcs = ttk.LabelFrame(container, text="Functions to bring to this deal", padding=10)
        funcs.grid(row=1, column=0, sticky='ew')

        # Who pays? (Proposer or Partner)
        payer_row = ttk.Frame(funcs)
        payer_row.pack(fill='x', pady=(0, 6))
        ttk.Label(payer_row, text="Payer:").pack(side='left')
        self.payer_var = tk.StringVar(value='proposer')
        ttk.Radiobutton(payer_row, text=f"{self.current_player.name} (you)", variable=self.payer_var, value='proposer', command=self.update_trade_summary).pack(side='left', padx=(8, 0))
        ttk.Radiobutton(payer_row, text="Partner", variable=self.payer_var, value='recipient', command=self.update_trade_summary).pack(side='left', padx=(8, 0))

        # Pay Money
        pay_row = ttk.Frame(funcs)
        pay_row.pack(fill='x', pady=4)
        ttk.Checkbutton(
            pay_row,
            text="💰 Pay Money",
            variable=self.cb_pay_money_var,
            command=self.update_trade_summary
        ).pack(side='left')
        ttk.Label(pay_row, text="Amount: $").pack(side='left', padx=(10, 2))
        ttk.Entry(pay_row, textvariable=self.pay_amount_var, width=10).pack(side='left')

        # For X Turns (Rounds)
        turns_row = ttk.Frame(funcs)
        turns_row.pack(fill='x', pady=4)
        ttk.Checkbutton(
            turns_row,
            text="🔢 For X Turns (rounds)",
            variable=self.cb_for_turns_var,
            command=self.update_trade_summary
        ).pack(side='left')
        ttk.Label(turns_row, text="Turns:").pack(side='left', padx=(10, 2))
        ttk.Entry(turns_row, textvariable=self.turns_var, width=10).pack(side='left')

        # Optional legacy 'Every Turn'
        legacy_row = ttk.Frame(funcs)
        legacy_row.pack(fill='x', pady=4)
        ttk.Checkbutton(
            legacy_row,
            text="⏰ Every Turn (legacy - not required)",
            variable=self.cb_every_turn_var,
            command=self.update_trade_summary
        ).pack(side='left')
        ttk.Label(
            legacy_row,
            text="Payments already execute on payer's turns.",
            foreground='#95a5a6'
        ).pack(side='left', padx=8)

        # Preview area
        preview = ttk.LabelFrame(container, text="Selected Functions Summary", padding=10)
        preview.grid(row=2, column=0, sticky='ew', pady=(10, 0))
        self.blocks_summary_label = ttk.Label(preview, text="No functions selected", foreground='#7f8c8d')
        self.blocks_summary_label.pack(anchor='w')
    
    def create_blocks_panel(self, parent):
        """Deprecated in checkbox UX (kept for compatibility)."""
        pass
    
    def create_construction_area(self, parent):
        """Deprecated in checkbox UX (kept for compatibility)."""
        pass
    
    def add_block_to_chain(self, block_template):
        """Deprecated in checkbox UX (kept for compatibility)."""
        pass
    
    def redraw_construction_area(self):
        """Deprecated in checkbox UX (kept for compatibility)."""
        pass
    
    def remove_block(self, index):
        """Deprecated in checkbox UX (kept for compatibility)."""
        pass
    
    def update_block_value(self, index, value):
        """Deprecated in checkbox UX (kept for compatibility)."""
        pass
    
    def setup_summary_tab(self):
        """Setup trade summary and proposal interface"""
        self.summary_frame.grid_rowconfigure(0, weight=1)
        self.summary_frame.grid_columnconfigure(0, weight=1)
        
        # Summary display
        self.summary_text = tk.Text(self.summary_frame, height=20, wrap=tk.WORD, 
                                   font=('Arial', 10), state=tk.DISABLED)
        summary_scrollbar = ttk.Scrollbar(self.summary_frame, orient="vertical", 
                                        command=self.summary_text.yview)
        self.summary_text.configure(yscrollcommand=summary_scrollbar.set)
        
        self.summary_text.grid(row=0, column=0, sticky='nsew', padx=(0, 5))
        summary_scrollbar.grid(row=0, column=1, sticky='ns')
        
        # Buttons
        button_frame = ttk.Frame(self.summary_frame)
        button_frame.grid(row=1, column=0, columnspan=2, sticky='ew', pady=(10, 0))
        button_frame.grid_columnconfigure(1, weight=1)
        
        self.propose_btn = ttk.Button(button_frame, text="📨 Propose Trade", 
                                    command=self.propose_trade, state='disabled')
        self.propose_btn.grid(row=0, column=0, padx=(0, 10), sticky='w')
        
        ttk.Button(button_frame, text="🔄 Clear All", 
                  command=self.clear_trade).grid(row=0, column=1, padx=5)
        
        ttk.Button(button_frame, text="❌ Cancel", 
                  command=self.dialog.destroy).grid(row=0, column=2, padx=(10, 0), sticky='e')
    
    def on_partner_selected(self, event):
        """Handle partner selection"""
        partner_name = self.partner_var.get()
        self.selected_partner = next((p for p in self.all_players if p.name == partner_name), None)
        
        if self.selected_partner:
            self.populate_request_panel()
            self.selection_label.config(text=f"Trading with: {self.selected_partner.name}")
            self.propose_btn.config(state='normal')
            self.update_trade_summary()
        else:
            self.propose_btn.config(state='disabled')
    
    def set_money_amount(self, amount, money_type):
        """Set money amount for offer or request"""
        if money_type == 'offer':
            self.offer_money_var.set(amount)
        elif money_type == 'request':
            self.request_money_var.set(amount)
        self.update_trade_summary()
    
    def update_trade_summary(self):
        """Update the complete trade summary"""
        if not self.selected_partner:
            return
        
        # Clear and update summary
        self.summary_text.config(state=tk.NORMAL)
        self.summary_text.delete(1.0, tk.END)
        
        summary_parts = []
        
        # Traditional trading summary
        summary_parts.append("=== TRADITIONAL TRADING ===\n")
        
        # Get selected properties
        offered_props = [prop for var, prop in getattr(self, 'offer_property_vars', []) if var.get()]
        requested_props = [prop for var, prop in getattr(self, 'request_property_vars', []) if var.get()]
        
        # Your offer
        your_offer = []
        if offered_props:
            prop_names = [prop.name for prop in offered_props]
            your_offer.append(f"Properties: {', '.join(prop_names)}")
        
        offered_money = self.offer_money_var.get()
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
        
        requested_money = self.request_money_var.get()
        if requested_money > 0:
            their_offer.append(f"Money: ${requested_money}")
        
        if their_offer:
            summary_parts.append(f"You request: {' + '.join(their_offer)}")
        else:
            summary_parts.append("You request: Nothing")

        # Function blocks summary (from checkbox selections)
        selected_blocks = []
        # Payer preview
        payer_label = "You" if getattr(self, 'payer_var', None) and self.payer_var.get() == 'proposer' else "Partner"
        selected_blocks.append(f"Payer: {payer_label}")
        if self.cb_pay_money_var.get():
            # Show parsed/cleaned amount for preview
            ok_amt, val_amt = self._parse_positive_int(self.pay_amount_var.get(), "Amount", allow_zero=False)
            amt_text = f"${val_amt:,}" if ok_amt else f"${self.pay_amount_var.get()}"
            selected_blocks.append(f"Pay Money ({amt_text})")
        if self.cb_for_turns_var.get():
            ok_turns, val_turns = self._parse_positive_int(self.turns_var.get(), "Turns", allow_zero=False)
            turns_text = f"{val_turns}" if ok_turns else f"{self.turns_var.get()}"
            selected_blocks.append(f"For {turns_text} Turns (rounds)")
        if self.cb_every_turn_var.get():
            selected_blocks.append("Every Turn (legacy)")

        if selected_blocks:
            summary_parts.append("\n=== FUNCTIONS SELECTED ===")
            for s in selected_blocks:
                summary_parts.append(f"• {s}")
            # Simple readiness hint
            if self.cb_pay_money_var.get() and self.cb_for_turns_var.get():
                summary_parts.append("\n✅ Ready: Recurring payment per payer turn")

        # Update blocks tab preview label as well
        if hasattr(self, 'blocks_summary_label'):
            self.blocks_summary_label.config(
                text=", ".join(selected_blocks) if selected_blocks else "No functions selected"
            )

        self.summary_text.insert(tk.END, '\n'.join(summary_parts))
        self.summary_text.config(state=tk.DISABLED)
    
    def propose_trade(self):
        """Propose the combined trade"""
        if not self.selected_partner:
            messagebox.showerror("Error", "Please select a trading partner")
            return
        
        # Get traditional trade components
        offered_props = [prop for var, prop in getattr(self, 'offer_property_vars', []) if var.get()]
        requested_props = [prop for var, prop in getattr(self, 'request_property_vars', []) if var.get()]
        offered_money = self.offer_money_var.get()
        requested_money = self.request_money_var.get()
        
        # Build function_blocks from checkbox selections
        built_blocks = []
        # Payer meta-block (so executor knows who pays)
        payer_value = self.payer_var.get() if hasattr(self, 'payer_var') else 'proposer'
        built_blocks.append({
            "type": "meta",
            "name": "Payer",
            "value": payer_value,
        })
        # Validate and parse numeric inputs if selected
        if self.cb_pay_money_var.get():
            ok_amt, val_amt = self._parse_positive_int(self.pay_amount_var.get(), "Amount", allow_zero=False)
            if not ok_amt:
                messagebox.showerror("Invalid Amount", val_amt)
                return
            built_blocks.append({
                "type": "action",
                "name": "Pay Money",
                "description": "Transfer money between players",
                "variable": "amount",
                "default": 100,
                "value": val_amt,
                "icon": "💰",
            })
        if self.cb_for_turns_var.get():
            ok_turns, val_turns = self._parse_positive_int(self.turns_var.get(), "Turns", allow_zero=False)
            if not ok_turns:
                messagebox.showerror("Invalid Turns", val_turns)
                return
            built_blocks.append({
                "type": "timing",
                "name": "For X Turns",
                "description": "Repeat each payer turn",
                "variable": "turns",
                "default": 5,
                "value": val_turns,
                "icon": "🔢",
            })
        if self.cb_every_turn_var.get():
            built_blocks.append({
                "type": "timing",
                "name": "Every Turn",
                "description": "Legacy timing flag",
                "icon": "⏰",
            })
        
        # Validate traditional trade or functions present
        if not offered_props and not requested_props and offered_money == 0 and requested_money == 0 and not built_blocks:
            messagebox.showerror("Error", "Please specify something to trade")
            return
        
        # Create enhanced Trade object
        trade = Trade(
            proposer=self.current_player,
            recipient=self.selected_partner,
            offered_properties=offered_props,
            requested_properties=requested_props,
            offered_money=offered_money,
            requested_money=requested_money
        )
        
        # Add function blocks to trade (from checkbox selections)
        trade.function_blocks = built_blocks
        
        # Add to pending trades
        self.game.add_pending_trade(trade)
        
        messagebox.showinfo("Trade Proposed", 
                           f"Combined trade proposal sent to {self.selected_partner.name}!")
        self.dialog.destroy()
    
    def clear_trade(self):
        """Clear all trade settings"""
        # Clear traditional trading
        for var, _ in getattr(self, 'offer_property_vars', []):
            var.set(False)
        for var, _ in getattr(self, 'request_property_vars', []):
            var.set(False)
        
        self.offer_money_var.set(0)
        self.request_money_var.set(0)
        
        # Clear function selections
        self.cb_pay_money_var.set(False)
        self.cb_for_turns_var.set(False)
        self.cb_every_turn_var.set(False)
        self.pay_amount_var.set("100")
        self.turns_var.set("5")
        if hasattr(self, 'blocks_summary_label'):
            self.blocks_summary_label.config(text="No functions selected")

        self.update_trade_summary()

def open_combined_trade_dialog(parent, current_player, all_players, game):
    """Open the combined trading dialog"""
    print("🚀 Starting combined trade dialog...")  # Debug output
    dialog = CombinedTradingDialog(parent, current_player, all_players, game)
    print("✅ Combined trade dialog created successfully!")  # Debug output
    return dialog

# Removed legacy duplicate dialog and EnhancedTrade to avoid conflicts with function block executor
