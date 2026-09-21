#!/usr/bin/env python3
"""Adaptation ponctuelle du modèle original, jamais exécutée par l’application.
Usage : python scripts/prepare-template.py '/chemin/Facture N°13 Dar Taliba.docx'
Dépendance de développement facultative : lxml. Le .docx préparé est versionné.
"""
import sys
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E

ROOT = Path(__file__).resolve().parent.parent
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P = 'http://schemas.openxmlformats.org/package/2006/relationships'
NS = {'w': W, 'r': R}
def w(tag, **attrs):
    node = E.Element('{'+W+'}'+tag)
    for key, value in attrs.items(): node.set('{'+W+'}'+key, str(value))
    return node
def paragraph(text='', size=24, bold=False, align=None, before=0, after=0, font='Carlito', color='000000'):
    p = w('p'); props = w('pPr'); p.append(props)
    props.append(w('spacing', before=before, after=after, line=240, lineRule='auto'))
    if align: props.append(w('jc', val=align))
    run = w('r'); rp = w('rPr'); run.append(rp)
    rp.append(w('rFonts', ascii=font, hAnsi=font, cs=font)); rp.append(w('sz', val=size)); rp.append(w('color', val=color))
    if bold: rp.append(w('b'))
    t = w('t'); t.text = text; t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve'); run.append(t); p.append(run)
    return p
def replace_cell(cell, text):
    old = cell.find('w:p', NS)
    p = deepcopy(old) if old is not None else paragraph()
    rp = p.find('w:r/w:rPr', NS)
    rp = deepcopy(rp) if rp is not None else w('rPr')
    # Supprimer les compressions de caractères appliquées aux anciens montants.
    for node in list(rp):
        if E.QName(node).localname in ['spacing', 'w', 'rtl']: rp.remove(node)
    for node in list(p):
        if node.tag != '{'+W+'}pPr': p.remove(node)
    run = w('r'); run.append(rp); t = w('t'); t.text = text; run.append(t); p.append(run)
    for node in list(cell):
        if node.tag != '{'+W+'}tcPr': cell.remove(node)
    cell.append(p)
def xml(node): return E.tostring(node, encoding='UTF-8', xml_declaration=True, standalone=True)
def drawing(rid, name, x, y, width, height, watermark=False):
    # Millimètres -> EMU, image ancrée par rapport à la page.
    x, y, width, height = [round(n * 36000) for n in (x, y, width, height)]
    alpha = '<a:alphaModFix amt="100000"/>' if watermark else ''
    return E.fromstring(f'''<w:p xmlns:w="{W}" xmlns:r="{R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>{x}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>{y}</wp:posOffset></wp:positionV><wp:extent cx="{width}" cy="{height}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="{1002 if watermark else 1001}" name="{name}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{rid}">{alpha}</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{width}" cy="{height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>''')
def box(name, x, y, width, height, color=None, children=None):
    style = f'position:absolute;margin-left:{x*72/25.4:.3f}pt;margin-top:{y*72/25.4:.3f}pt;width:{width*72/25.4:.3f}pt;height:{height*72/25.4:.3f}pt;z-index:-1;mso-position-horizontal-relative:page;mso-position-vertical-relative:page'
    p=E.fromstring(f'''<w:p xmlns:w="{W}" xmlns:v="urn:schemas-microsoft-com:vml"><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr><w:r><w:pict><v:rect id="{name}" style="{style}" stroked="f" filled="{'t' if color else 'f'}" fillcolor="{color or '#ffffff'}"/></w:pict></w:r></w:p>''')
    if children:
        rect=p.find('.//{urn:schemas-microsoft-com:vml}rect')
        tb=E.SubElement(rect,'{urn:schemas-microsoft-com:vml}textbox',inset='0,0,0,0')
        content=E.SubElement(tb,'{'+W+'}txbxContent')
        for child in children: content.append(child)
    return p

with ZipFile(sys.argv[1]) as source:
    files = {name: source.read(name) for name in source.namelist()}
doc = E.fromstring(files['word/document.xml'])
body = doc.find('w:body',NS)
table = deepcopy(body.find('w:tbl',NS))
rows = table.findall('w:tr',NS)
replace_cell(rows[0].find('w:tc',NS),'{projet}')
for row in rows[:2]:
    trpr=row.find('w:trPr',NS)
    if trpr is None: trpr=w('trPr');row.insert(0,trpr)
    trpr.append(w('tblHeader'))
line=rows[2]
for cell, value in zip(line.findall('w:tc',NS),['{#lignes}{numeroPrix}','{designation}','{unite}','{quantite}','{prixUnitaire}','{prixTotal}{/lignes}']): replace_cell(cell,value)
table.remove(rows[3])
values=[('MONTANT TOTAL HT:','{totalHT}'),('MONTANT TVA (TAUX = {tauxTVA} %)','{tva}'),('MONTANT TOTAL TTC','{ttc}'),('{#appliquerRasIS}A DEDUIRE RAS IS {tauxRasIS}% DU MONTANT TOTAL HT','{rasIS}{/appliquerRasIS}'),('{#appliquerRasTVA}A DEDUIRE RAS TVA {tauxRasTVA}% DU MONTANT DE LA T.V.A','{rasTVA}{/appliquerRasTVA}'),('{#afficherTotalAPayer}TOTAL A PAYER','{totalAPayer}{/afficherTotalAPayer}')]
for row, pair in zip(rows[4:],values):
    for cell,value in zip(row.findall('w:tc',NS),pair):replace_cell(cell,value)
# Préserver les bordures, fusions, largeurs et styles du tableau original.
props=table.find('w:tblPr',NS)
props.find('w:tblInd',NS).set('{'+W+'}w','0')
for row in table.findall('w:tr',NS):
    trpr=row.find('w:trPr',NS)
    if trpr is None: trpr=w('trPr');row.insert(0,trpr)
    for height in trpr.findall('w:trHeight',NS):height.set('{'+W+'}hRule','atLeast')
    trpr.append(w('cantSplit'))
    for node in row.xpath('.//w:keepNext|.//w:keepLines',namespaces=NS):node.getparent().remove(node)
for p in table.xpath('.//w:p',namespaces=NS):
    pp=p.find('w:pPr',NS)
    if pp is not None:
        for spacing in pp.findall('w:spacing',NS):pp.remove(spacing)
        pp.append(w('spacing',before=0,after=0,line=240,lineRule='auto'))
# Garder les totaux et la clôture ensemble lors d’un saut de page Word.
table.find('w:tr/w:tc/w:p/w:pPr/w:spacing',NS).set('{'+W+'}before','261')
for row in table.findall('w:tr',NS)[3:]:
    for pp in row.xpath('.//w:pPr',namespaces=NS):pp.append(w('keepNext'))

for child in list(body):body.remove(child)
meta=w('tbl');tp=w('tblPr');tp.append(w('tblW',w=10683,type='dxa'));tp.append(w('tblLayout',type='fixed'))
borders=w('tblBorders')
for side in ['top','left','bottom','right','insideH','insideV']:borders.append(w(side,val='nil'))
tp.append(borders);meta.append(tp)
grid=w('tblGrid');grid.append(w('gridCol',w=5667));grid.append(w('gridCol',w=5016));meta.append(grid)
tr=w('tr');trpr=w('trPr');trpr.append(w('trHeight',val=2290,hRule='atLeast'));tr.append(trpr)
for i in range(2):
    tc=w('tc');tcpr=w('tcPr');tcpr.append(w('tcW',w=5667 if i==0 else 5016,type='dxa'));tc.append(tcpr)
    if i==0:
        tc.append(paragraph('FACTURE Nº {numero}',font='Noto Sans',bold=True))
        date=paragraph('DATE ',font='Noto Sans',bold=True)
        date.append(paragraph('{date}',font='Noto Sans').find('w:r',NS));tc.append(date)
    else:
        tc.append(paragraph('POUR',font='Noto Sans',size=22,before=735,after=30));tc.append(paragraph('{destinataire}',font='Noto Sans',size=22,after=30));tc.append(paragraph('{#reference}',font='Noto Sans',size=22));tc.append(paragraph('REFERENCE: {reference}',font='Noto Sans',size=22));tc.append(paragraph('{/reference}',font='Noto Sans',size=22))
    tr.append(tc)
meta.append(tr);body.append(meta)
gap=paragraph('',size=2);body.append(gap)
body.append(table)
for text,before,after in [('Arrêté la présente facture à la somme de :',230,100),('{montantEnLettres}.',0,0)]:
    p=paragraph(text,font='Noto Sans',before=before,after=after)
    p.find('w:pPr',NS).append(w('keepNext'));body.append(p)
# Tableau de clôture : remerciement à gauche, simple texte Signature à droite.
closing=deepcopy(meta)
for row in closing.findall('w:tr',NS):closing.remove(row)
for col,value in zip(closing.find('w:tblGrid',NS),[7900,2783]):col.set('{'+W+'}w',str(value))
tr=w('tr')
trpr=w('trPr');trpr.append(w('cantSplit'));tr.append(trpr)
for text,align,width in [('Nous vous remercions de votre confiance','left',7900),('Signature','center',2783)]:
    tc=w('tc');tcpr=w('tcPr');tcpr.append(w('tcW',w=width,type='dxa'));tc.append(tcpr);tc.append(paragraph(text,font='Noto Sans',align=align,before=140));tr.append(tc)
closing.append(tr);body.append(closing)
sect=w('sectPr')
for type_,rid in [('headerReference','exnovHeader'),('footerReference','exnovFooter')]:
    ref=w(type_,type='default');ref.set('{'+R+'}id',rid);sect.append(ref)
sect.append(w('pgSz',w=11906,h=16838));sect.append(w('pgMar',top=3685,right=612,bottom=1417,left=612,header=0,footer=0,gutter=0));sect.append(w('cols',space=720));body.append(sect)

header=E.Element('{'+W+'}hdr',nsmap={'w':W,'r':R})
header.append(box('exnov-gold',57,38.5,153,11.5,'#f8be18'))
header.append(box('exnov-dark',0,40.5,15,11.5,'#2f444a'))
header.append(drawing('logo','EXNOV logo',15,22,39,32))
header.append(drawing('watermark','EXNOV filigrane',23,104,164,116,True))
header.append(box('exnov-brand',57,14,146,24,children=[paragraph('{societe} — {activite}',size=18,bold=True,color='EEB700',after=45),paragraph('{sousTitre1}',size=16,bold=True,color='2F444A',after=30),paragraph('{sousTitre2}',size=16,bold=True,color='2F444A',after=30),paragraph('{sousTitre3}',size=16,bold=True,color='2F444A')]))
footer=E.Element('{'+W+'}ftr',nsmap={'w':W,'r':R})
footer.append(box('footer-background',0,274.5,210,17.5,'#2f444a'))
footer.append(box('footer-gold',0,292,210,5,'#f8be18'))
footer.append(box('footer-contact',7,280,94,11,children=[paragraph('Tél. {telephone}    @ {email}',size=16,color='FFFFFF'),paragraph('Web {site}',size=16,color='FFFFFF')]))
footer.append(box('footer-rule',103,278.5,.5,10,'#f8be18'))
footer.append(box('footer-company',107,277.5,97,14,children=[paragraph('{piedDePage}',size=15,color='FFFFFF'),paragraph('N° RC: {rc} · N° ICE: {ice} · N° TP: {tp}',size=15,color='FFFFFF'),paragraph('N° RIB: {rib}',size=15,color='FFFFFF')]))

rels=E.fromstring(files['word/_rels/document.xml.rels'])
for rel in list(rels):
    if rel.get('Type').split('/')[-1] in ['image','hyperlink']:rels.remove(rel)
for type_,rid,file in [('header','exnovHeader','header1.xml'),('footer','exnovFooter','footer1.xml')]:
    E.SubElement(rels,'{'+P+'}Relationship',Id=rid,Type=R+'/'+type_,Target=file)
headerrels=E.Element('{'+P+'}Relationships',nsmap={None:P})
for rid,target in [('logo','exnov-logo.png'),('watermark','exnov-watermark.png')]:
    E.SubElement(headerrels,'{'+P+'}Relationship',Id=rid,Type=R+'/image',Target='media/'+target)
ct=E.fromstring(files['[Content_Types].xml'])
for name,type_ in [('header1.xml','header'),('footer1.xml','footer')]:
    E.SubElement(ct,'{http://schemas.openxmlformats.org/package/2006/content-types}Override',PartName='/word/'+name,ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.'+type_+'+xml')
# Polices libres embarquées côté HTML. Les mêmes familles sont indiquées côté Word.
styles=E.fromstring(files['word/styles.xml'])
for node in styles.xpath('//w:rFonts',namespaces=NS):
    for attr in ['ascii','hAnsi','cs','eastAsia']:node.set('{'+W+'}'+attr,'Carlito')
    for attr in ['asciiTheme','hAnsiTheme','cstheme','eastAsiaTheme']:node.attrib.pop('{'+W+'}'+attr,None)
files.update({'word/document.xml':xml(doc),'word/header1.xml':xml(header),'word/footer1.xml':xml(footer),'word/_rels/document.xml.rels':xml(rels),'word/_rels/header1.xml.rels':xml(headerrels),'[Content_Types].xml':xml(ct),'word/styles.xml':xml(styles)})
for name in list(files):
    if name.startswith('word/media/') or name.startswith('docProps/'):
        if name.startswith('word/media/'):del files[name]
        elif name.endswith('.xml'):
            root=E.fromstring(files[name])
            for child in list(root):root.remove(child)
            files[name]=xml(root)
files['word/media/exnov-logo.png']=(ROOT/'public/logo-exnov.png').read_bytes()
files['word/media/exnov-watermark.png']=(ROOT/'public/watermark-exnov.png').read_bytes()
with ZipFile(ROOT/'templates/facture-exnov.docx','w',ZIP_DEFLATED) as output:
    for name,data in files.items():output.writestr(name,data)
print('Modèle prêt : templates/facture-exnov.docx')
