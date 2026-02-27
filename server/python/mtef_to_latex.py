#!/usr/bin/env python3
"""
MTEF v3 (Equation Editor 3.x) binary to LaTeX converter.
Parses "Equation Native" OLE stream from DOCX embedded objects.
"""
import struct
import sys
import io


# Template selectors (MTEF v3 — Equation Editor numbering)
# Source: rtf2latex2e.sourceforge.net/MTEF3.html
TMPL_FRACT = 0x0a    # fraction (full-size)
TMPL_ROOT = 0x0d      # root/radical
TMPL_SCRIPT = 0x0f    # sub/superscript

# From actual EE3.x analysis, common selectors:
# 0x03 = TMPL record type
# selector byte after TMPL tag

# Typeface values (biased by +128)
TF_TEXT = 1
TF_FUNCTION = 2
TF_VARIABLE = 3
TF_LCGREEK = 4
TF_UCGREEK = 5
TF_SYMBOL = 6
TF_VECTOR = 7
TF_NUMBER = 8
TF_MTEXTRA = 11

# Symbol font character mapping (common math symbols)
SYMBOL_MAP = {
    0x00B1: '\\pm',
    0x00D7: '\\times',
    0x00F7: '\\div',
    0x2212: '-',
    0x221A: '\\sqrt',
    0x221E: '\\infty',
    0x2260: '\\neq',
    0x2264: '\\leq',
    0x2265: '\\geq',
    0x2248: '\\approx',
    0x2261: '\\equiv',
    0x03B1: '\\alpha',
    0x03B2: '\\beta',
    0x03B3: '\\gamma',
    0x03B4: '\\delta',
    0x03B5: '\\varepsilon',
    0x03B6: '\\zeta',
    0x03B7: '\\eta',
    0x03B8: '\\theta',
    0x03BB: '\\lambda',
    0x03BC: '\\mu',
    0x03BD: '\\nu',
    0x03C0: '\\pi',
    0x03C1: '\\rho',
    0x03C3: '\\sigma',
    0x03C4: '\\tau',
    0x03C6: '\\varphi',
    0x03C9: '\\omega',
    0x0393: '\\Gamma',
    0x0394: '\\Delta',
    0x03A3: '\\Sigma',
    0x03A9: '\\Omega',
    0x2202: '\\partial',
    0x2205: '\\varnothing',
    0x2208: '\\in',
    0x2209: '\\notin',
    0x2229: '\\cap',
    0x222A: '\\cup',
    0x2282: '\\subset',
    0x2283: '\\supset',
    0x22C5: '\\cdot',
    0x2026: '\\ldots',
    0x2192: '\\to',
    0x2190: '\\leftarrow',
    0x21D2: '\\Rightarrow',
    0x21D4: '\\Leftrightarrow',
    0x2200: '\\forall',
    0x2203: '\\exists',
    0x00AC: '\\neg',
}


class MTEFParser:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        self.latex = []

    def read_byte(self) -> int:
        if self.pos >= len(self.data):
            return -1
        b = self.data[self.pos]
        self.pos += 1
        return b

    def read_word(self) -> int:
        """Read 16-bit LE word"""
        if self.pos + 1 >= len(self.data):
            return 0
        val = struct.unpack_from('<H', self.data, self.pos)[0]
        self.pos += 2
        return val

    def peek_byte(self) -> int:
        if self.pos >= len(self.data):
            return -1
        return self.data[self.pos]

    def parse(self) -> str:
        """Parse MTEF binary and return LaTeX string"""
        # Skip OLE header (first 4 bytes = cbHdr, then cbHdr-4 more bytes)
        if len(self.data) < 4:
            return ''
        cb_hdr = struct.unpack_from('<I', self.data, 0)[0]
        self.pos = cb_hdr  # MTEF data starts right after header

        # MTEF header (5 bytes)
        version = self.read_byte()
        platform = self.read_byte()
        product = self.read_byte()
        prod_ver = self.read_byte()
        prod_sub = self.read_byte()

        if version != 3:
            return f'[MTEF v{version} not supported]'

        # Parse records — equation may have multiple top-level sections
        parts = []
        while self.pos < len(self.data):
            result = self.parse_records()
            if result:
                parts.append(result)
            # If we hit END but there's more data, keep going
            if self.pos >= len(self.data):
                break
            # Check if remaining bytes are all zeros (padding)
            remaining = self.data[self.pos:]
            if all(b == 0 for b in remaining):
                break
        raw = ''.join(parts).strip()
        return self._postprocess(raw)

    @staticmethod
    def _postprocess(latex: str) -> str:
        """Clean up common MTEF parsing artifacts"""
        import re
        # Remove Private Use Area characters (U+E000-U+F8FF) — MTExtra font artifacts
        latex = re.sub(r'[\uE000-\uF8FF]+', '', latex)
        # Fix empty fence: \left\{\right. followed by content → \left\{content\right.
        # Pattern: left brace immediately closed, then pile/content follows
        latex = re.sub(r'\\left\\{\\right\.', r'\\left\\{', latex)
        # If \left\{ without matching \right, add \right. at end
        if '\\left\\{' in latex and '\\right' not in latex:
            latex = latex + '\\right.'
        # Remove stray { before \end{array/cases} (EE3 trailing fence delimiter)
        latex = re.sub(r'\{(\\end\{)', r'\1', latex)
        # Remove stray { after \end{cases}
        latex = re.sub(r'\\end\{cases\}\{', r'\\end{cases}', latex)
        # Convert \left\{\begin{array}{c}...\end{array}...\right. → \begin{cases}...\end{cases}...
        latex = re.sub(
            r'\\left\\{\\begin\{array\}\{c\}(.*?)\\end\{array\}(.*?)\\right\.',
            r'\\begin{cases}\1\\end{cases}\2',
            latex,
            flags=re.DOTALL
        )
        # Wrap plain text after \end{cases/array} in \text{} for KaTeX
        latex = re.sub(
            r'(\\end\{(?:cases|array)[^}]*\})([a-zA-Z][a-zA-Z\',\s]*?)(\\)',
            lambda m: f'{m.group(1)}\\text{{{m.group(2)}}}{m.group(3)}',
            latex
        )
        # Convert literal ... to \ldots
        latex = re.sub(r'(?<!\\)\.\.\.', r'\\ldots', latex)
        # Clean up [sym:0xNNNN] artifacts (unmapped symbols)
        latex = re.sub(r'\[sym:0x[0-9a-f]+\]', '', latex)
        # Clean up [chr:0xNNNN] artifacts
        latex = re.sub(r'\[chr:0x[0-9a-f]+\]', '', latex)
        # Clean up [tmpl:0xNN]{...} artifacts
        latex = re.sub(r'\[tmpl:0x[0-9a-f]+\]', '', latex)
        return latex.strip()

    def parse_records(self) -> str:
        """Parse a sequence of records until END or EOF"""
        parts = []
        while self.pos < len(self.data):
            tag_byte = self.read_byte()
            if tag_byte == -1:
                break

            tag_type = tag_byte & 0x0F
            tag_flags = (tag_byte >> 4) & 0x0F

            if tag_type == 0:  # END
                break
            elif tag_type == 1:  # LINE
                if tag_flags & 0x1:  # xfNULL — no objects
                    if tag_flags & 0x4:  # xfLSPACE
                        self.read_word()  # skip line spacing
                    continue
                if tag_flags & 0x8:  # xfLMOVE — nudge
                    self.skip_nudge()
                if tag_flags & 0x4:  # xfLSPACE
                    self.read_word()
                if tag_flags & 0x2:  # xfRULER
                    self.skip_ruler()
                content = self.parse_records()
                parts.append(content)
            elif tag_type == 2:  # CHAR
                char_str = self.parse_char(tag_flags)
                parts.append(char_str)
            elif tag_type == 3:  # TMPL
                tmpl_str = self.parse_tmpl(tag_flags)
                parts.append(tmpl_str)
            elif tag_type == 4:  # PILE
                pile_str = self.parse_pile(tag_flags)
                parts.append(pile_str)
            elif tag_type == 5:  # MATRIX
                self.skip_until_end()
            elif tag_type == 6:  # EMBELL
                embell_str = self.parse_embell(tag_flags)
                parts.append(embell_str)
            elif tag_type == 9:  # SIZE
                self.parse_size(tag_flags)
            elif 10 <= tag_type <= 14:  # TYPESIZE (FULL/SUB/SUB2/SYM/SUBSYM)
                pass  # No additional data
            elif tag_type == 8:  # FONT
                self.parse_font_def(tag_flags)
            else:
                pass  # Unknown, skip

        return ''.join(parts)

    def _collect_lines(self) -> list:
        """Parse records until END, grouping by top-level LINE records.
        Returns list of strings, one per LINE."""
        lines = []
        while self.pos < len(self.data):
            tag_byte = self.read_byte()
            if tag_byte == -1:
                break
            tag_type = tag_byte & 0x0F
            tag_flags = (tag_byte >> 4) & 0x0F

            if tag_type == 0:  # END
                break
            elif tag_type == 1:  # LINE
                if tag_flags & 0x1:  # xfNULL
                    if tag_flags & 0x4:
                        self.read_word()
                    continue
                if tag_flags & 0x8:
                    self.skip_nudge()
                if tag_flags & 0x4:
                    self.read_word()
                if tag_flags & 0x2:
                    self.skip_ruler()
                # Recurse: flatten nested LINE records (e.g. system of equations)
                sub_lines = self._collect_lines()
                lines.extend(sub_lines)
            elif tag_type == 2:  # CHAR
                s = self.parse_char(tag_flags)
                if lines:
                    lines[-1] += s
                else:
                    lines.append(s)
            elif tag_type == 3:  # TMPL
                s = self.parse_tmpl(tag_flags)
                if lines:
                    lines[-1] += s
                else:
                    lines.append(s)
            elif tag_type == 4:  # PILE
                s = self.parse_pile(tag_flags)
                if lines:
                    lines[-1] += s
                else:
                    lines.append(s)
            elif tag_type == 5:  # MATRIX
                self.skip_until_end()
            elif tag_type == 6:  # EMBELL
                s = self.parse_embell(tag_flags)
                if lines:
                    lines[-1] += s
                else:
                    lines.append(s)
            elif tag_type == 9:  # SIZE
                self.parse_size(tag_flags)
            elif 10 <= tag_type <= 14:
                pass
            elif tag_type == 8:  # FONT
                self.parse_font_def(tag_flags)
        return lines

    def parse_char(self, flags: int) -> str:
        """Parse CHAR record"""
        if flags & 0x8:  # xfLMOVE
            self.skip_nudge()

        typeface_raw = self.read_byte()
        typeface = typeface_raw - 128 if typeface_raw >= 128 else typeface_raw

        char_code = self.read_word()

        # Handle embellishments
        if flags & 0x2:  # xfEMBELL
            embell = self.parse_embellishment_list()
            char_str = self.char_to_latex(typeface, char_code)
            return embell + char_str

        return self.char_to_latex(typeface, char_code)

    def char_to_latex(self, typeface: int, char_code: int) -> str:
        """Convert typeface + char code to LaTeX"""
        if typeface == TF_SYMBOL or typeface == TF_MTEXTRA:
            if char_code in SYMBOL_MAP:
                return SYMBOL_MAP[char_code]
            # Try ASCII mapping for Symbol font
            if 0x20 <= char_code <= 0x7E:
                c = chr(char_code)
                return c
            return f'[sym:{char_code:#x}]'

        # For text/number/variable fonts, use ASCII/Unicode
        if char_code < 0x80:
            return chr(char_code)
        # Try Unicode
        try:
            return chr(char_code)
        except (ValueError, OverflowError):
            return f'[chr:{char_code:#x}]'

    def parse_tmpl(self, flags: int) -> str:
        """Parse TMPL record"""
        if flags & 0x8:  # xfLMOVE
            self.skip_nudge()

        selector = self.read_byte()
        variation = self.read_byte()

        # Template options byte if variation bit 7 set
        tmpl_opts = 0
        if variation & 0x80:
            tmpl_opts = self.read_byte()
            variation &= 0x7F  # Clear bit 7

        # Parse based on selector
        # Selectors from MTEF v3 (Equation Editor 3.x):
        # 0x0d = tmROOT (radical), 0x0e = tmFRACT (fraction), 0x0f = tmSCRIPT (sub/super)

        if selector == 0x0d:  # tmROOT — radical
            index_slot = self.parse_records()  # slot 1: index (often empty in EE3)

            if variation != 0 and not index_slot:
                # EE3 nth root: index is last LINE in radicand slot
                lines = self._collect_lines()
                if len(lines) >= 2:
                    radicand = ''.join(lines[:-1])
                    index = lines[-1]
                    return f'\\sqrt[{index}]{{{radicand}}}'
                radicand = lines[0] if lines else ''
                return f'\\sqrt{{{radicand}}}'

            radicand = self.parse_records()  # slot 2: radicand content
            if variation == 0:
                return f'\\sqrt{{{radicand}}}'
            if index_slot:
                return f'\\sqrt[{index_slot}]{{{radicand}}}'
            return f'\\sqrt{{{radicand}}}'

        elif selector == 0x0e:  # tmFRACT — fraction
            # EE3: slot0=empty(bar) END, then content slot with LINE(num)+LINE(den)
            self.parse_records()  # skip empty bar slot
            lines = self._collect_lines()
            num = lines[0] if lines else ''
            den = lines[1] if len(lines) > 1 else ''
            if variation == 1:
                return f'\\tfrac{{{num}}}{{{den}}}'
            return f'\\frac{{{num}}}{{{den}}}'

        elif selector == 0x0f:  # tmSCRIPT — sub/superscript
            if variation == 0:  # superscript only
                base_part = self.parse_records()
                sup = self.parse_records()
                return f'{base_part}^{{{sup}}}'
            elif variation == 1:  # subscript only
                base_part = self.parse_records()
                sub = self.parse_records()
                return f'{base_part}_{{{sub}}}'
            else:  # both (variation == 2)
                base_part = self.parse_records()
                sub = self.parse_records()
                sup = self.parse_records()
                return f'{base_part}_{{{sub}}}^{{{sup}}}'

        elif selector in (0x00, 0x01, 0x02, 0x03, 0x04, 0x05):
            # Fence templates: angle, paren, brace, bracket, bar, dbar
            fence_map = {0: ('\\langle ', '\\rangle'), 1: ('\\left(', '\\right)'), 2: ('\\left\\{', '\\right\\}'),
                        3: ('\\left[', '\\right]'), 4: ('\\left|', '\\right|'), 5: ('\\left\\|', '\\right\\|')}
            left, right = fence_map.get(selector, ('\\left(', '\\right)'))
            self.parse_records()  # slot 1 (empty)

            if selector == 0x02:
                # Brace fence — may contain system of equations (PILE + LINEs)
                lines = self._collect_lines()
                if len(lines) > 1:
                    # System of equations → \begin{cases}...\end{cases}
                    return '\\begin{cases}' + ' \\\\ '.join(lines) + '\\end{cases}'
                content = lines[0] if lines else ''
            else:
                content_raw = self.parse_records()  # slot 2 (content + trailing delim chars)
                delim_pair = {0: '<>', 1: '()', 3: '[]', 4: '||', 5: '||'}
                dp = delim_pair.get(selector, '')
                content = content_raw[:-len(dp)] if dp and content_raw.endswith(dp) else content_raw

            if variation == 0:  # Both
                return f'{left}{content}{right}'
            elif variation == 1:  # Left only
                return f'{left}{content}\\right.'
            else:  # Right only
                return f'\\left.{content}{right}'

        elif selector in (0x10, 0x11, 0x12, 0x13, 0x14, 0x15):
            # Big operators: integral, sum, prod, etc.
            op_map = {0x10: '\\int', 0x11: '\\sum', 0x12: '\\prod',
                     0x13: '\\coprod', 0x14: '\\bigcup', 0x15: '\\bigcap'}
            op = op_map.get(selector, '\\int')
            # Read slots
            main_content = self.parse_records()
            lower = self.parse_records()
            upper = self.parse_records()
            result = op
            if lower:
                result += f'_{{{lower}}}'
            if upper:
                result += f'^{{{upper}}}'
            if main_content:
                result += f' {main_content}'
            return result

        elif selector == 0x16:  # Limit
            content = self.parse_records()
            limit = self.parse_records()
            return f'\\lim_{{{limit}}} {content}'

        elif selector == 0x17:  # Square root (alternative)
            radicand = self.parse_records()
            return f'\\sqrt{{{radicand}}}'

        elif selector == 0x18:  # Nth root (alternative)
            index = self.parse_records()
            radicand = self.parse_records()
            return f'\\sqrt[{index}]{{{radicand}}}'

        else:
            # Unknown template, try to read slots
            content = self.parse_records()
            return f'[tmpl:{selector:#x}]{{{content}}}'

    def parse_pile(self, flags: int) -> str:
        """Parse PILE record"""
        if flags & 0x8:
            self.skip_nudge()

        # pile_type byte
        pile_halign = self.read_byte()

        if flags & 0x2:  # xfRULER
            self.skip_ruler()

        lines = self._collect_lines()

        if len(lines) > 1:
            return '\\begin{array}{c}' + ' \\\\ '.join(lines) + '\\end{array}'
        return lines[0] if lines else ''

    def parse_embell(self, flags: int) -> str:
        """Parse EMBELL record"""
        if flags & 0x8:
            self.skip_nudge()
        embell_type = self.read_byte()

        # Common embellishments
        embell_map = {
            0x02: '\\hat',
            0x03: '\\tilde',
            0x04: '\\dot',
            0x05: '\\ddot',
            0x06: '\\vec',
            0x07: '\\bar',
            0x08: '\\overline',
        }
        return embell_map.get(embell_type, '')

    def parse_embellishment_list(self) -> str:
        """Parse embellishment list after embellished char"""
        parts = []
        while self.pos < len(self.data):
            tag_byte = self.peek_byte()
            if tag_byte == -1:
                break
            tag_type = tag_byte & 0x0F
            if tag_type != 6:  # Not EMBELL
                break
            self.read_byte()
            tag_flags = (tag_byte >> 4) & 0x0F
            embell = self.parse_embell(tag_flags)
            parts.append(embell)
        return ''.join(parts)

    def parse_size(self, flags: int) -> None:
        """Parse SIZE record (skip for now)"""
        if flags & 0x8:
            self.skip_nudge()
        lsize = self.read_byte()
        if lsize < 0x80:
            self.read_byte()  # dsize
        else:
            self.read_word()  # explicit size

    def parse_font_def(self, flags: int) -> None:
        """Parse FONT definition record (skip for now)"""
        if flags & 0x8:
            self.skip_nudge()
        enc_def_index = self.read_byte()
        # Read null-terminated font name
        while self.pos < len(self.data):
            b = self.read_byte()
            if b == 0:
                break

    def skip_nudge(self) -> None:
        """Skip nudge bytes"""
        dx = self.read_byte()
        dy = self.read_byte()
        if dx == 128 and dy == 128:
            self.read_word()  # extended dx
            self.read_word()  # extended dy

    def skip_ruler(self) -> None:
        """Skip ruler record"""
        n_stops = self.read_byte()
        for _ in range(n_stops):
            self.read_byte()  # tab type
            self.read_word()  # tab offset

    def skip_until_end(self) -> None:
        """Skip records until END"""
        depth = 1
        while self.pos < len(self.data) and depth > 0:
            tag_byte = self.read_byte()
            if tag_byte == -1:
                break
            tag_type = tag_byte & 0x0F
            if tag_type == 0:
                depth -= 1
            elif tag_type in (1, 3, 4, 5):
                depth += 1


def parse_ole_equation(ole_data: bytes) -> str:
    """Parse an OLE Equation Editor object and return LaTeX"""
    parser = MTEFParser(ole_data)
    return parser.parse()


def extract_formula_map(docx_path: str) -> dict:
    """Extract OLE equation formulas from DOCX.
    Returns {image_filename: latex_string} mapping using DOCX relationships."""
    import zipfile
    import olefile
    import xml.etree.ElementTree as ET
    import json

    z = zipfile.ZipFile(docx_path, 'r')

    # Parse relationships: rId -> target
    rels_xml = z.read('word/_rels/document.xml.rels').decode('utf-8')
    rels_root = ET.fromstring(rels_xml)
    rid_map = {}
    for rel in rels_root:
        rid_map[rel.attrib.get('Id', '')] = rel.attrib.get('Target', '')

    # Parse document.xml for w:object elements
    doc_xml = z.read('word/document.xml').decode('utf-8')
    doc_root = ET.fromstring(doc_xml)

    W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    V_NS = 'urn:schemas-microsoft-com:vml'
    O_NS = 'urn:schemas-microsoft-com:office:office'
    R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

    formula_map = {}

    for obj_elem in doc_root.iter(f'{{{W_NS}}}object'):
        ole_elem = obj_elem.find(f'{{{O_NS}}}OLEObject')
        if ole_elem is None:
            continue

        ole_rid = ole_elem.attrib.get(f'{{{R_NS}}}id', '')
        ole_target = rid_map.get(ole_rid, '')
        if not ole_target:
            continue

        # Find imagedata in shape
        img_name = None
        for imgdata in obj_elem.iter(f'{{{V_NS}}}imagedata'):
            img_rid = imgdata.attrib.get(f'{{{R_NS}}}id', '')
            img_target = rid_map.get(img_rid, '')
            if img_target:
                img_name = img_target.split('/')[-1]
                break

        if not img_name:
            continue

        # Extract OLE data and parse MTEF
        ole_path = 'word/' + ole_target
        try:
            ole_data = z.read(ole_path)
            ole_file = olefile.OleFileIO(io.BytesIO(ole_data))
            if ole_file.exists('Equation Native'):
                eq_data = ole_file.openstream('Equation Native').read()
                latex = parse_ole_equation(eq_data)
                if latex and not latex.startswith('['):
                    formula_map[img_name] = latex
            ole_file.close()
        except Exception:
            pass

    z.close()
    return formula_map


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python mtef_to_latex.py [--json-map] <docx_file>")
        sys.exit(1)

    import json

    if sys.argv[1] == '--json-map' and len(sys.argv) >= 3:
        result = extract_formula_map(sys.argv[2])
        print(json.dumps(result))
    else:
        import zipfile
        import olefile

        docx_path = sys.argv[1]
        z = zipfile.ZipFile(docx_path, 'r')
        ole_files = sorted([n for n in z.namelist() if 'oleObject' in n])

        for ole_name in ole_files:
            ole_data = z.read(ole_name)
            ole_file = olefile.OleFileIO(io.BytesIO(ole_data))
            if ole_file.exists('Equation Native'):
                eq_data = ole_file.openstream('Equation Native').read()
                latex = parse_ole_equation(eq_data)
                basename = ole_name.split('/')[-1]
                print(f'{basename}: {latex}')
            ole_file.close()
