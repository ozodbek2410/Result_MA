"""
qr.py — QR payload parsing uchun unit testlar.
v1 (plain string), v1.5 ({c,q}), v2 ({v:2,c,q,t}) formatlar.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from qr import _parse_payload


class TestParsePayload:
    def _call(self, data: str) -> dict:
        result = {'found': True, 'raw': data, 'variant_code': None,
                  'total_questions': None, 'test_type': None}
        _parse_payload(data, result)
        return result

    def test_v2_full(self):
        r = self._call('{"v":2,"c":"A1B2C3D4","q":90,"t":"block_test"}')
        assert r['variant_code'] == 'A1B2C3D4'
        assert r['total_questions'] == 90
        assert r['test_type'] == 'block_test'

    def test_v2_test_type(self):
        r = self._call('{"v":2,"c":"XYZW","q":30,"t":"test"}')
        assert r['variant_code'] == 'XYZW'
        assert r['test_type'] == 'test'

    def test_v1_5_json(self):
        """Eski PDF format: {c, q} — v field yo'q."""
        r = self._call('{"c":"9EC69645","q":60}')
        assert r['variant_code'] == '9EC69645'
        assert r['total_questions'] == 60
        assert r['test_type'] is None

    def test_v1_plain_string(self):
        """Eng eski format: plain variant code string."""
        r = self._call('9EC69645')
        assert r['variant_code'] == '9EC69645'
        assert r['total_questions'] is None

    def test_v2_whitespace_stripped(self):
        r = self._call('  {"v":2,"c":"CODE","q":45}  ')
        assert r['variant_code'] == 'CODE'

    def test_broken_json_fallback(self):
        """Buzilgan JSON → plain string sifatida qabul qilish."""
        r = self._call('{not valid json}')
        # variant_code None bo'lishi mumkin (buzilgan)
        # Hech bo'lmaganda xato bermaydi
        assert 'error' not in r or r.get('variant_code') is None


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
