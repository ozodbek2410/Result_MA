# fixtures/

Haqiqiy skanerlangan answer sheet rasmlari shu yerga joylashadi.

## Fayl nomlash
```
<variant_code>_<result>.jpg
# Misol:
ABC123_A-B-C-D-A.jpg    # Q1=A, Q2=B, Q3=C, Q4=D, Q5=A
blank_sheet.jpg          # To'ldirilmagan varaq
partial_30q.jpg          # Qisman to'ldirilgan, 30 savol
```

## Qo'shish tartibi
1. AnswerSheetV2 chop et (TestPrintPage → "PDF yuklash")
2. Qo'lda to'ldir (faqat ma'lum javoblar)
3. Telefon kamera bilan skan qil (min 8MP, yaxshi yoritish)
4. Ushbu papkaga qo'y
5. `test_scanner.py` ga fixture-based test qo'sh:

```python
FIXTURES = Path(__file__).parent / "fixtures"

@pytest.mark.skipif(not (FIXTURES / "ABC123_A-B-C.jpg").exists(), reason="fixture yo'q")
def test_real_scan_accuracy():
    path = str(FIXTURES / "ABC123_A-B-C.jpg")
    result = OMRScanner().scan(path, total_questions=30)
    assert result["success"]
    assert result["detected_answers"]["1"] == "A"
    assert result["detected_answers"]["2"] == "B"
```

## Nima uchun muhim
Sintetik testlar grid formulasini tekshiradi.
Haqiqiy fixture testlar CLAHE, warp, noise toleransini tekshiradi.
