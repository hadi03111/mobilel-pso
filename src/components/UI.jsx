import React from'react';import{Search}from'lucide-react';
export const money=n=>`PKR ${Number(n||0).toLocaleString()}`;
export function Card({children,className=''}){return <div className={`card ${className}`}>{React.Children.map(children,child=>React.isValidElement(child)&&child.type==='table'&&!className.includes('table-card')?<div className="table-scroll">{child}</div>:child)}</div>};
export function PageHead({title,subtitle,actions}){return <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="head-actions">{actions}</div></div>};
export function Stat({label,value,note,icon:Icon,tone=''}){return <Card className={`stat ${tone}`}><div className="stat-icon">{Icon&&<Icon size={20}/>}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></Card>};
export function Badge({children,tone}){let t=tone||String(children).toLowerCase().replaceAll(' ','-');return <span className={`badge ${t}`}>{children}</span>};
export function SearchBox({value,onChange,placeholder='Search...'}){return <div className="search"><Search size={17}/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>};
export function Empty({text='No records found'}){return <div className="empty">{text}</div>};
