#!/usr/bin/env python3
"""
Extract Tkinter/ttk UI structure (widgets, labels, colors, fonts, and layouts)
from a directory of Python files. Outputs a JSON summary and a readable Markdown.

Usage:
  python extract_tk_ui.py --src ../docs/old_ui_dump --out ../docs

This is a best-effort static AST parser; it won't execute code. It captures:
  - Widget creations (ttk.Button, tk.Label, Frame, etc.) with key kwargs (text/bg/fg/font)
  - Layout methods (grid/pack/place)
  - Widget configure() calls
  - Window titles via .title()
  - Menu labels via Menu.add_command(label=...)

Limitations:
  - Complex dynamic strings/variables may be skipped or recorded as reprs.
  - Parent-child relationships are inferred from constructor's first arg or 'master' kwarg.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple


WIDGET_NAMES: Set[str] = {
    # Common Tkinter widgets
    "Button", "Label", "Frame", "Entry", "Checkbutton", "Radiobutton",
    "Scale", "Spinbox", "Listbox", "Text", "Canvas", "Scrollbar",
    "Toplevel", "Menu", "LabelFrame", "PanedWindow",
    # ttk widgets
    "Treeview", "Notebook", "Combobox", "Separator", "Progressbar",
}

LAYOUT_METHODS = {"grid", "pack", "place"}
CONFIG_METHODS = {"config", "configure"}


def literal_str(node: ast.AST) -> Optional[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):  # f-strings: best-effort
        parts = []
        for v in node.values:
            if isinstance(v, ast.FormattedValue):
                parts.append("{expr}")
            elif isinstance(v, ast.Constant) and isinstance(v.value, str):
                parts.append(v.value)
        return "".join(parts) or None
    return None


def literal_any(node: ast.AST) -> Optional[Any]:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, (ast.Tuple, ast.List)):
        vals = [literal_any(elt) for elt in node.elts]
        if all(v is not None for v in vals):
            return vals
    s = literal_str(node)
    if s is not None:
        return s
    return None


def attr_chain(node: ast.AST) -> str:
    # Return dotted path for Attribute/Name chains (e.g., ttk.Button -> "ttk.Button")
    if isinstance(node, ast.Attribute):
        return f"{attr_chain(node.value)}.{node.attr}"
    if isinstance(node, ast.Name):
        return node.id
    return ""


class TkUiCollector(ast.NodeVisitor):
    def __init__(self, source_code: str) -> None:
        super().__init__()
        self.source = source_code
        self.widgets: Dict[str, Dict[str, Any]] = {}
        self.creation_order: List[str] = []
        self.import_aliases: Dict[str, str] = {}
        self.window_titles: List[str] = []
        self.menu_items: List[Dict[str, Any]] = []
        # Track calls for layout/config application after creation
        self._var_names: Set[str] = set()

    # Imports to detect aliases like: import tkinter as tk; from tkinter import ttk
    def visit_Import(self, node: ast.Import) -> None:
        for n in node.names:
            if n.name in ("tkinter", "Tkinter"):
                self.import_aliases[n.asname or n.name] = "tkinter"
            if n.name.endswith("ttk"):
                self.import_aliases[n.asname or n.name] = "ttk"
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module is None:
            return
        mod = node.module
        if mod in ("tkinter", "Tkinter"):
            for n in node.names:
                # e.g., from tkinter import ttk as ttk
                if n.name == "ttk":
                    self.import_aliases[n.asname or n.name] = "ttk"
                else:
                    self.import_aliases[n.asname or n.name] = "tkinter"
        elif mod.endswith(".ttk") or mod == "ttk":
            for n in node.names:
                self.import_aliases[n.asname or n.name] = "ttk"
        self.generic_visit(node)

    def _is_widget_ctor(self, func: ast.AST) -> Tuple[bool, str]:
        name = attr_chain(func)
        # Matches: ttk.Button, tk.Label, Button (direct import), etc.
        if "." in name:
            base, cls = name.rsplit(".", 1)
            if cls in WIDGET_NAMES and base in self.import_aliases:
                return True, cls
            # Common shorthands: tk.Button, ttk.Button if aliases are literally 'tk'/'ttk'
            if cls in WIDGET_NAMES and base in ("tk", "ttk"):
                return True, cls
        else:
            # Directly imported classes
            if name in WIDGET_NAMES:
                return True, name
        return False, ""

    def _extract_kwargs(self, node: ast.Call) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for kw in node.keywords:
            if kw.arg is None:
                continue
            val = literal_any(kw.value)
            if val is not None:
                out[kw.arg] = val
        return out

    def _first_arg_name(self, node: ast.Call) -> Optional[str]:
        if node.args:
            a0 = node.args[0]
            if isinstance(a0, ast.Name):
                return a0.id
            if isinstance(a0, ast.Attribute):
                return attr_chain(a0)
        for kw in node.keywords:
            if kw.arg in ("master", "parent"):
                if isinstance(kw.value, ast.Name):
                    return kw.value.id
                if isinstance(kw.value, ast.Attribute):
                    return attr_chain(kw.value)
        return None

    def _assign_target_name(self, targets: List[ast.expr]) -> Optional[str]:
        # Only handle simple assignment: x = Widget(...)
        for t in targets:
            if isinstance(t, ast.Name):
                return t.id
        return None

    def visit_Assign(self, node: ast.Assign) -> None:
        if isinstance(node.value, ast.Call):
            is_widget, cls = self._is_widget_ctor(node.value.func)
            if is_widget:
                var = self._assign_target_name(node.targets)
                if var:
                    parent = self._first_arg_name(node.value)
                    kwargs = self._extract_kwargs(node.value)
                    wid = {
                        "var": var,
                        "class": cls,
                        "parent": parent,
                        "kwargs": kwargs,
                        "layout": {},
                        "configs": [],
                        "line": getattr(node, "lineno", None),
                    }
                    self.widgets[var] = wid
                    self.creation_order.append(var)
                    self._var_names.add(var)
        self.generic_visit(node)

    def visit_Expr(self, node: ast.Expr) -> None:
        # Capture direct calls like root.title("...")
        call = node.value
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute):
            method = call.func.attr
            owner = call.func.value
            if method == "title":
                if call.args:
                    t = literal_str(call.args[0])
                    if t:
                        self.window_titles.append(t)
            elif method in CONFIG_METHODS:
                # best effort: config called on a known var
                if isinstance(owner, ast.Name) and owner.id in self._var_names:
                    cfg = self._extract_kwargs(call)
                    if cfg:
                        self.widgets[owner.id].setdefault("configs", []).append(cfg)
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        # Track layout or configure calls: var.grid(...), var.pack(...)
        if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
            var = node.func.value.id
            method = node.func.attr
            if var in self._var_names:
                if method in LAYOUT_METHODS:
                    self.widgets[var].setdefault("layout", {}).setdefault(method, []).append(self._extract_kwargs(node))
                elif method in CONFIG_METHODS:
                    cfg = self._extract_kwargs(node)
                    if cfg:
                        self.widgets[var].setdefault("configs", []).append(cfg)
                elif method == "add_command":
                    # Menu items
                    item = {"owner": var, **self._extract_kwargs(node)}
                    if any(k in item for k in ("label", "command")):
                        self.menu_items.append(item)
        self.generic_visit(node)


def collect_from_file(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            src = f.read()
    except UnicodeDecodeError:
        with open(path, "r", encoding="latin-1", errors="ignore") as f:
            src = f.read()
    try:
        tree = ast.parse(src, filename=path)
    except SyntaxError as e:
        return {"file": path, "error": f"SyntaxError: {e}"}
    collector = TkUiCollector(src)
    collector.visit(tree)

    # Post-process: extract labels/texts/colors/fonts summary
    widgets = list(collector.widgets.values())
    texts: List[str] = []
    colors: Set[str] = set()
    fonts: Set[str] = set()

    def record_kwargs(d: Dict[str, Any]):
        t = d.get("text")
        if isinstance(t, str) and t:
            texts.append(t)
        # common color keys
        for k in ("bg", "fg", "background", "foreground", "highlightcolor"):
            v = d.get(k)
            if isinstance(v, str) and v:
                if re.match(r"^#?[0-9A-Fa-f]{3,8}$", v) or v.isalpha():
                    colors.add(v)
        v = d.get("font")
        if isinstance(v, (str, list)):
            fonts.add(str(v))

    for w in widgets:
        record_kwargs(w.get("kwargs", {}))
        for cfg in w.get("configs", []) or []:
            if isinstance(cfg, dict):
                record_kwargs(cfg)

    return {
        "file": path,
        "widgets": widgets,
        "order": collector.creation_order,
        "window_titles": collector.window_titles,
        "menu_items": collector.menu_items,
        "texts": texts,
        "colors": sorted(colors),
        "fonts": sorted(fonts),
    }


def aggregate(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    all_texts: List[str] = []
    all_colors: Set[str] = set()
    all_fonts: Set[str] = set()
    files: List[Dict[str, Any]] = []
    for r in results:
        if "error" in r:
            files.append(r)
            continue
        files.append({k: r[k] for k in ("file", "widgets", "order", "window_titles", "menu_items", "texts", "colors", "fonts")})
        all_texts.extend(r.get("texts", []))
        all_colors.update(r.get("colors", []))
        all_fonts.update(r.get("fonts", []))
    # common labels guessed as buttons/actions
    common_actions = [t for t in all_texts if t and len(t) <= 32]
    return {
        "summary": {
            "unique_colors": sorted(all_colors),
            "unique_fonts": sorted(all_fonts),
            "sample_texts": sorted(set(common_actions))[:200],
        },
        "files": files,
    }


def to_markdown(agg: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Legacy Tkinter UI Spec (Extracted)\n")
    lines.append("## Summary\n")
    uniq_colors = ", ".join(agg.get("summary", {}).get("unique_colors", []))
    uniq_fonts = ", ".join(agg.get("summary", {}).get("unique_fonts", []))
    lines.append(f"- Colors: {uniq_colors or 'n/a'}\n")
    lines.append(f"- Fonts: {uniq_fonts or 'n/a'}\n")
    sample_texts = agg.get("summary", {}).get("sample_texts", [])
    if sample_texts:
        lines.append("- Sample labels/buttons:\n")
        for t in sample_texts[:100]:
            safe = t.replace("\n", " ")
            lines.append(f"  - {safe}\n")

    for f in agg.get("files", []):
        lines.append(f"\n## File: {os.path.relpath(f.get('file', ''))}\n")
        if "error" in f:
            lines.append(f"- Parse error: {f['error']}\n")
            continue
        titles = f.get("window_titles", []) or []
        if titles:
            lines.append("- Window titles:\n")
            for t in titles:
                lines.append(f"  - {t}\n")
        menus = f.get("menu_items", []) or []
        if menus:
            lines.append("- Menu items:\n")
            for m in menus[:50]:
                label = m.get("label")
                if label:
                    lines.append(f"  - {label}\n")
        widgets = f.get("widgets", []) or []
        if widgets:
            lines.append("- Widgets:\n")
            for w in widgets[:300]:
                cls = w.get("class")
                var = w.get("var")
                parent = w.get("parent")
                kwargs = w.get("kwargs", {})
                text = kwargs.get("text")
                color = kwargs.get("bg") or kwargs.get("background")
                font = kwargs.get("font")
                line = w.get("line")
                lines.append(f"  - {cls} `{var}` (parent={parent}, line={line})\n")
                if text or color or font:
                    parts = []
                    if text:
                        parts.append(f"text={text!r}")
                    if color:
                        parts.append(f"bg={color!r}")
                    if font:
                        parts.append(f"font={font!r}")
                    lines.append(f"    - {'; '.join(parts)}\n")
                layout = w.get("layout", {})
                for m, calls in layout.items():
                    for idx, call in enumerate(calls[:3]):
                        lines.append(f"    - {m}({call})\n")

    return "".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="Directory containing dumped legacy UI .py files")
    ap.add_argument("--out", required=True, help="Output directory for JSON/Markdown specs")
    args = ap.parse_args()

    src_dir = os.path.abspath(args.src)
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    py_files: List[str] = []
    skip_dirs = {".venv", "venv", "env", "__pycache__"}
    skip_substrings = {"site-packages", "dist-packages", "dist-info", "egg-info"}
    for root, dirs, files in os.walk(src_dir):
        # prune directories in-place
        dirs[:] = [d for d in dirs if d not in skip_dirs and not any(s in d for s in skip_substrings)]
        for fn in files:
            if fn.endswith(".py"):
                py_files.append(os.path.join(root, fn))

    results: List[Dict[str, Any]] = []
    for fp in sorted(py_files):
        results.append(collect_from_file(fp))

    agg = aggregate(results)

    raw_path = os.path.join(out_dir, "ui_spec_raw.json")
    md_path = os.path.join(out_dir, "ui_spec.md")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(agg, f, indent=2, ensure_ascii=False)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(to_markdown(agg))

    print(f"Wrote {raw_path}")
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()
