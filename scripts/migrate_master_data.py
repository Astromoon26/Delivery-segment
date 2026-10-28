"""Isi workbook master baru dari CSV 18 tab lama.

  python3 -I scripts/migrate_master_data.py <folder CSV tab lama> [output.xlsx]

Folder berisi '<nama tab>.csv' (unduh lewat gviz). Hanya membaca; gsheet tidak diubah.
Setelah itu jalankan recalc LibreOffice (formula Cost/CBM) dan upload ke Google Drive agar jadi Google Sheet.
"""
import csv, re, datetime, sys
from collections import Counter, OrderedDict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment

S=(sys.argv[1] if len(sys.argv)>1 else 'src').rstrip('/')+'/'
def rd(t): return list(csv.reader(open(S+t+'.csv',encoding='utf-8')))
def nz(x): return [r for r in x if any(c.strip() for c in r)]
def num(v):
    v=(v or '').strip().replace('Rp','').replace(' ','')
    if v in ('','-'): return None
    if re.fullmatch(r'\d{1,3}(\.\d{3})+',v): v=v.replace('.','')
    v=v.replace(',','')
    try:
        f=float(v); return int(f) if f==int(f) else f
    except: return None
def low(s): return re.sub(r'\s+',' ',(s or '').strip().replace('BKS ','').replace('Hub ','').replace('HUB ','')).lower()
BUS=['HCI','AHI']; STAT={}

# ---- Master Kab-Kota (dari tab NDC, kedua BU dicek sama)
mk=OrderedDict()
for bu in BUS:
    h,*rows=rd(f'NDC {bu}'); ix={c:i for i,c in enumerate(h)}
    for r in nz(rows):
        k=r[ix['Kabupaten/Kota']]
        if k and k not in mk: mk[k]=[r[ix['No']],k,r[ix['Tipe']],r[ix['Provinsi']],r[ix['Pulau/Kepulauan']]]
mk_rows=[[int(r[0]) if r[0].strip().isdigit() else r[0]]+r[1:] for r in mk.values()]
mk_rows.sort(key=lambda r:(r[0] if isinstance(r[0],int) else 9999))
STAT['kab']=len(mk_rows)

# ---- Master Fasilitas
h,*rows=rd('Name of Facility'); fac=[]
for r in nz(rows):
    fac.append([r[0],r[1],r[2],num(r[3]),num(r[4])])
STAT['fas']=len(fac)

# ---- Rantai Hub (Matriks)
chain=[]; feeder={}
h,*rows=rd('Matriks Facility to Facility HCI')
for r in nz(rows):
    hub,hub2,sdc,rdc,ndc=(r+['']*5)[:5]
    chain.append(['HCI',hub,hub2,sdc,rdc,ndc]); 
    if hub2: feeder[('HCI',low(hub))]=hub2
h,*rows=rd('Matriks Facility to Facility AHI')
for r in nz(rows):
    hub,sdc,rdc,ndc=(r+['']*4)[:4]
    chain.append(['AHI',hub,'',sdc,rdc,ndc])
STAT['chain']=len(chain)

# ---- Coverage
cov=[]
for bu in BUS:
    for tier,tab in [('HUB','Hub'),('SDC','SDC'),('RDC','RDC'),('NDC','NDC')]:
        h,*rows=rd(f'{tab} {bu}'); ix={c:i for i,c in enumerate(h) if c}
        col=ix['HUB'] if tier=='HUB' else ix[tier]
        for r in nz(rows):
            f=r[col].strip()
            if not f: continue
            kab=r[ix['Kabupaten/Kota']]
            if tier=='NDC':
                ltl=num(r[ix['Lead Time Land']]); lts=num(r[ix['Lead Time Sea']]); reg=r[ix['NDC Reguler']].strip() if 'NDC Reguler' in ix else ''
                cov.append([bu,kab,tier,f,'',reg,ltl,lts])
            else:
                lt=num(r[ix['Lead Time land']])
                cov.append([bu,kab,tier,f,feeder.get((bu,low(f)),'') if tier=='HUB' else '','',lt,None])
STAT['cov']=Counter((r[0],r[2]) for r in cov)

# ---- Leg (union LT & Cost legs)
legs=OrderedDict()
for bu in BUS:
    h,*rows=rd(f'Lead Time Facility to Facility {bu}')
    for r in nz(rows):
        k=(bu,r[1].strip(),r[2].strip()); legs[k]=[bu,r[0].strip(),r[1].strip(),r[2].strip(),num(r[3]),num(r[4])]
only_cost=[]
for bu in BUS:
    h,*rows=rd(f'Cost Facility to Facility {bu}')
    for r in nz(rows):
        k=(bu,r[1].strip(),r[2].strip())
        if k not in legs: legs[k]=[bu,r[0].strip(),r[1].strip(),r[2].strip(),None,None]; only_cost.append(k)
leg_rows=list(legs.values()); STAT['leg']=len(leg_rows); STAT['leg_only_cost']=len(only_cost)

# ---- Tarif
tar=[]
def armmode(hname):
    m=re.fullmatch(r'(.+?)\s+(Darat|Laut)',hname.strip())
    return (m.group(1),m.group(2)) if m else None
generic=0
for bu in BUS:
    h,*rows=rd(f'Cost Facility to Facility {bu}')
    for r in nz(rows):
        for j,c in enumerate(h):
            v=num(r[j]) if j<len(r) else None
            if v is None or j<3: continue
            am=armmode(c)
            if am: tar.append([bu,'Leg',r[1].strip(),r[2].strip(),am[0],am[1],v,None,''])
            elif c in('Cost Land','Cost Sea'): tar.append([bu,'Leg',r[1].strip(),r[2].strip(),'Umum','Darat' if c=='Cost Land' else 'Laut',v,None,'kolom Cost Land/Sea lama (tanpa armada)']); generic+=1
for bu in BUS:
    for tier,tab,lvl in [('HUB','Hub','Last mile'),('SDC','SDC','Last mile'),('RDC','RDC','Last mile'),('NDC','NDC','Project')]:
        h,*rows=rd(f'{tab} {bu}'); ix={c:i for i,c in enumerate(h) if c}
        fcol=ix['HUB'] if tier=='HUB' else ix[tier]
        for r in nz(rows):
            f=r[fcol].strip(); kab=r[ix['Kabupaten/Kota']]
            if not f: continue
            for c,j in ix.items():
                v=num(r[j]) if j<len(r) else None
                if v is None: continue
                am=armmode(c)
                if am: tar.append([bu,lvl,f,kab,am[0],am[1],v,None,''])
                elif c in('Cost','Cost Land','Cost Sea'): tar.append([bu,lvl,f,kab,'Umum','Laut' if c=='Cost Sea' else 'Darat',v,None,'kolom cost lama (tanpa armada)']); generic+=1
                elif c=='Cost/Trip':
                    cb=num(r[ix['Cost/CBM']]) if 'Cost/CBM' in ix and ix['Cost/CBM']<len(r) else None
                    tar.append([bu,lvl,f,kab,'Langsung','Darat',v,cb,'Cost/Trip & Cost/CBM langsung (kolom Langsung)'])
        # Cost/CBM tanpa Cost/Trip
STAT['tar']=Counter((r[0],r[1]) for r in tar); STAT['generic']=generic

# ---- Rute
rute=[]
for bu in BUS:
    h,*rows=rd(f'Rute Numbered {bu}')
    for r in nz(rows):
        for j,c in enumerate(h):
            m=re.fullmatch(r'(Rute|Opsional rute|Project rute)\s+(\d+)',c.strip())
            if m and j<len(r) and r[j].strip(): rute.append([bu,r[0],m.group(1),int(m.group(2)),r[j].strip()])
STAT['rute']=Counter((r[0],r[2]) for r in rute)

# ---- Armada
h,*rows=rd('Armada'); arm=[[r[0],num(r[1]),num(r[2])] for r in nz(rows)]

# =============== workbook
F='Arial'
hdr_fill=PatternFill('solid',fgColor='1F3864'); hdr_font=Font(name=F,bold=True,color='FFFFFF',size=10)
inp=Font(name=F,color='0000FF',size=10); blk=Font(name=F,size=10)
grey=PatternFill('solid',fgColor='F2F2F2')
thin=Side(style='thin',color='D9D9D9'); box=Border(left=thin,right=thin,top=thin,bottom=thin)
wb=Workbook()
def sheet(name, cols, rows, widths, dv=None, fmts=None, formula_cols=()):
    ws=wb.create_sheet(name)
    for j,c in enumerate(cols,1):
        cell=ws.cell(row=1,column=j,value=c); cell.fill=hdr_fill; cell.font=hdr_font; cell.border=box
        cell.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True)
    ws.row_dimensions[1].height=30
    for i,r in enumerate(rows,2):
        for j,v in enumerate(r,1):
            cell=ws.cell(row=i,column=j,value=(None if v=='' else v)); cell.font=blk if (j-1) in formula_cols else inp
            if fmts and (j-1) in fmts: cell.number_format=fmts[j-1]
            if (j-1) in formula_cols: cell.fill=grey
    for j,w in enumerate(widths,1): ws.column_dimensions[ws.cell(row=1,column=j).column_letter].width=w
    ws.freeze_panes='A2'; ws.auto_filter.ref=f'A1:{ws.cell(row=1,column=len(cols)).column_letter}{max(2,len(rows)+1)}'
    for col,lst in (dv or {}).items():
        d=DataValidation(type='list',formula1='"'+','.join(lst)+'"',allow_blank=True); ws.add_data_validation(d); d.add(f'{col}2:{col}5000')
    return ws
BU=['HCI','AHI']; TIER=['HUB','SDC','RDC','NDC']
sheet('Master Kab-Kota',['No','Kabupaten/Kota','Tipe','Provinsi','Pulau/Kepulauan'],mk_rows,[8,38,14,26,22],dv={'C':['Kabupaten','Kota']})
sheet('Master Fasilitas',['BU','Tipe','Nama Fasilitas','Long','Lat'],fac,[14,10,28,16,16],dv={'A':['HCI','AHI','HCI & AHI'],'B':TIER})
sheet('Coverage',['BU','Kabupaten/Kota','Tier','Fasilitas','Feeder (via hub)','NDC Reguler','LT Darat (hari)','LT Laut (hari)'],cov,[8,38,8,22,20,16,14,14],dv={'A':BU,'C':TIER})
sheet('Rantai Hub',['BU','HUB','HUB Feeder','SDC','RDC','NDC'],chain,[8,24,24,20,20,16],dv={'A':BU})
sheet('Leg',['BU','Remark','Dari','Ke','LT Darat (hari)','LT Laut (hari)'],leg_rows,[8,16,22,22,16,16],dv={'A':BU})
wt=sheet('Tarif',['BU','Level','Dari','Ke','Armada','Mode','Cost/Trip (Rp)','Cost/CBM (Rp)','Catatan'],tar,[8,12,22,36,12,10,18,18,48],
    dv={'A':BU,'B':['Leg','Last mile','Project'],'F':['Darat','Laut']},fmts={7:'#,##0;(#,##0);-',8:'#,##0;(#,##0);-'})
for i,r in enumerate(tar,2):
    if r[7] is None:
        c=wt.cell(row=i,column=8,value=f'=IFERROR(G{i}/(INDEX(Armada!$B$2:$B$50,MATCH(E{i},Armada!$A$2:$A$50,0))*INDEX(Armada!$C$2:$C$50,MATCH(E{i},Armada!$A$2:$A$50,0))/100),"")')
        c.font=blk; c.fill=grey; c.number_format='#,##0;(#,##0);-'
wt['H1'].comment=Comment('Formula: Cost/Trip / (Kapasitas cbm x Utilisasi%) dari tab Armada. Baris "Langsung"/"Umum" tidak punya armada, jadi kosong atau diisi manual.','Claude')
sheet('Rute',['BU','Kabupaten/Kota','Jenis','No','Rantai'],rute,[8,38,16,6,52],dv={'A':BU,'C':['Rute','Opsional rute','Project rute']})
sheet('Armada',['Armada','Kapasitas (cbm)','Utilisasi (%)'],arm,[16,18,16])

# ---- Petunjuk
ws=wb.create_sheet('Petunjuk',0)
now=datetime.datetime.now().strftime('%d %b %Y %H:%M')
def put(r,t,bold=False,size=10,color='000000',merge=True,h=None):
    c=ws.cell(row=r,column=1,value=t); c.font=Font(name=F,bold=bold,size=size,color=color); c.alignment=Alignment(wrap_text=True,vertical='top')
    if merge: ws.merge_cells(start_row=r,start_column=1,end_row=r,end_column=4)
    if h: ws.row_dimensions[r].height=h
put(1,'MASTER DATA — Delivery Network (format baru, terisi dari data gsheet)',True,14,'1F3864',h=26)
put(2,f'Diisi otomatis dari 18 tab gsheet lama pada {now} (hanya dibaca, gsheet tidak diubah). Dashboard BELUM membaca file ini; tab lama dibiarkan sebagai sumber sampai format baru disetujui.',h=32)
put(3,'Teks biru = diisi manual · teks hitam berlatar abu = formula (Cost/CBM) · header biru tua = nama kolom, jangan diubah.',h=20)
put(5,'Isi tiap tab dan pencocokan dengan tab lama',True,10,'1F3864',h=18)
hdr=['Tab baru','Baris terisi','Cek terhadap tab lama','Catatan']
for j,v in enumerate(hdr,1):
    c=ws.cell(row=6,column=j,value=v); c.fill=hdr_fill; c.font=hdr_font; c.border=box
cov_src=sum(len([1 for r in nz(rd(f'{tab} {bu}')[1:]) if (r[rd(f'{tab} {bu}')[0].index('HUB' if tab=='Hub' else tab)] or '').strip()]) for bu in BUS for tab in ['Hub','SDC','RDC','NDC'])
rows=[
 ('Master Kab-Kota',"=COUNTA('Master Kab-Kota'!B2:B5000)",f'{STAT["kab"]} kab/kota unik dari tab NDC HCI & AHI','No, Tipe, Provinsi, Pulau ditulis sekali di sini'),
 ('Master Fasilitas',"=COUNTA('Master Fasilitas'!C2:C5000)",f'{STAT["fas"]} baris Name of Facility','Long/Lat apa adanya dari sumber (dashboard otomatis mendeteksi yang tertukar)'),
 ('Coverage',"=COUNTA(Coverage!B2:B5000)",f'{cov_src} baris berfasilitas di 8 tab Hub/SDC/RDC/NDC','Satu kab/kota bisa punya >1 baris NDC (Project rute 2 dari NDC lain)'),
 ('Rantai Hub',"=COUNTA('Rantai Hub'!A2:A5000)",f'{STAT["chain"]} baris Matriks (HCI + AHI)','HUB Feeder hanya ada di HCI; HUB boleh kosong (rantai langsung SDC/RDC → NDC)'),
 ('Leg',"=COUNTA(Leg!C2:C5000)",f'gabungan Lead Time + Cost F2F; {STAT["leg_only_cost"]} leg hanya ada di tab Cost (LT kosong)','Lengkapi LT leg yang kosong di sini'),
 ('Tarif',"=COUNTA(Tarif!E2:E5000)",f'{sum(STAT["tar"].values())} sel cost berisi dari 14 tab (leg, last mile, project)',f'Cost/CBM otomatis; {STAT["generic"]} baris "Umum" = kolom Cost lama tanpa armada'),
 ('Rute',"=COUNTA(Rute!E2:E5000)",f'{sum(STAT["rute"].values())} sel rute berisi di Rute Numbered HCI & AHI','Rute 1/2/3, Opsional rute, Project rute'),
 ('Armada',"=COUNTA(Armada!A2:A50)",f'{len(arm)} armada','')]
for i,(a,f,b,c_) in enumerate(rows,7):
    for j,v in enumerate((a,f,b,c_),1):
        c=ws.cell(row=i,column=j,value=v); c.font=blk; c.border=box; c.alignment=Alignment(wrap_text=True,vertical='top')
    ws.row_dimensions[i].height=32
r=7+len(rows)+1
put(r,'Temuan saat memindahkan data (perlu dibenahi di master)',True,10,'1F3864',h=18)
finds=[
 '• Penulisan nama kab/kota tidak konsisten antar tab: "Kota Batam" (NDC HCI) vs "Kota B A T A M" (NDC AHI); "Kota D U M A I" muncul di Tarif — sebaiknya dibakukan lewat Master Kab-Kota.',
 f'• {STAT["leg_only_cost"]} leg ada di tab Cost tapi tidak ada di tab Lead Time (LT kosong di tab Leg).',
 f'• Cost last mile / project hampir kosong: hanya {sum(v for (b,l),v in STAT["tar"].items() if l!="Leg")} sel terisi di tab Hub/SDC/RDC/NDC; Cost F2F AHI kosong.',
 f'• Coverage per BU & tier: '+'; '.join(f'{b} {t}={n}' for (b,t),n in sorted(STAT['cov'].items()))+'.',
 '• Hub HCI di gsheet saat ini hanya 1 baris (Sidoarjo) sedangkan Hub AHI 42 baris — cek apakah memang begitu.',
]
for i,t in enumerate(finds,r+1): put(i,t,h=30)
ws.column_dimensions['A'].width=22; ws.column_dimensions['B'].width=14; ws.column_dimensions['C'].width=56; ws.column_dimensions['D'].width=58
order=['Petunjuk','Master Kab-Kota','Master Fasilitas','Coverage','Rantai Hub','Leg','Tarif','Rute','Armada']
del wb['Sheet']
wb._sheets=[wb[n] for n in order]
wb.save(sys.argv[2] if len(sys.argv)>2 else 'Master_Data_Terisi.xlsx')
print(STAT)
