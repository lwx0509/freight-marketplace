"""
Convert the FMC OTI List export (.xlsx) into the FreightLink import CSV format.

Usage:
    python3 convert_fmc.py "OTI List ....xlsx" carriers_import.csv [--include-ff] [--us-only]

Maps FMC columns -> import columns:
    company_name  <- Name
    contact_name  <- QI 1 (first Qualifying Individual)
    email         <- (blank; FMC does not publish emails)
    phone         <- Phone
    country       <- Nation
    lanes         <- (blank; FMC does not track trade lanes)
    fmc_id        <- Organization Number

By default only NVOCCs are included (the carrier side). Pass --include-ff to also
include freight forwarders, --us-only to keep only United States records.
"""

import csv
import sys
import openpyxl

OUT_FIELDS = ['company_name', 'contact_name', 'email', 'phone', 'country', 'lanes', 'fmc_id']


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    include_ff = '--include-ff' in sys.argv
    us_only = '--us-only' in sys.argv
    if len(args) < 2:
        print('Usage: python3 convert_fmc.py input.xlsx output.csv [--include-ff] [--us-only]')
        sys.exit(1)

    inp, outp = args[0], args[1]
    wb = openpyxl.load_workbook(inp, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]

    rows = ws.iter_rows(values_only=True)
    # Row 1 is a "List as of" banner; row 2 is the real header.
    next(rows)
    header = list(next(rows))
    idx = {name: i for i, name in enumerate(header)}

    def g(row, name):
        i = idx.get(name)
        v = row[i] if (i is not None and i < len(row)) else None
        return ('' if v is None else str(v)).strip()

    total = kept = with_contact = with_phone = 0
    seen = set()
    out_rows = []
    for row in rows:
        if not any(row):
            continue
        total += 1
        is_nvocc = g(row, 'NVOCC').upper() == 'NVOCC'
        is_ff = g(row, 'FF').upper() == 'FF'
        if not is_nvocc and not (include_ff and is_ff):
            continue
        if us_only and g(row, 'Nation').upper() != 'UNITED STATES':
            continue

        org = g(row, 'Organization Number')
        name = g(row, 'Name')
        if not name:
            continue
        key = org or name.lower()
        if key in seen:
            continue
        seen.add(key)

        contact = g(row, 'QI 1')
        phone = g(row, 'Phone')
        out_rows.append({
            'company_name': name,
            'contact_name': contact,
            'email': '',
            'phone': phone,
            'country': g(row, 'Nation'),
            'lanes': '',
            'fmc_id': org,
        })
        kept += 1
        if contact:
            with_contact += 1
        if phone:
            with_phone += 1

    with open(outp, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=OUT_FIELDS)
        w.writeheader()
        w.writerows(out_rows)

    print(f'Scanned rows:      {total}')
    print(f'Written carriers:  {kept}')
    print(f'  with contact:    {with_contact}')
    print(f'  with phone:      {with_phone}')
    print(f'  with email:      0 (FMC provides none)')
    print(f'Output: {outp}')


if __name__ == '__main__':
    main()
