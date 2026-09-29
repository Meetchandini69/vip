import { z } from 'zod';
export const postInput = z.object({
 title:z.string().trim().min(1).max(180), slug:z.string().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine(value=>!['admin','assets'].includes(value),'That URL slug is reserved.'),
 excerpt:z.string().trim().max(400), content:z.string().trim().max(100000),
 image:z.union([z.literal(''),z.url().refine(v=>v.startsWith('https://'),'Use an HTTPS image URL')]),
 image_alt:z.string().trim().max(200), author:z.string().trim().max(120), category:z.string().trim().min(1).max(80),
 meta_title:z.string().trim().max(180), meta_description:z.string().trim().max(320),
 schema_type:z.enum(['BlogPosting','Article']), status:z.enum(['draft','published']), version:z.number().int().positive().optional()
}).superRefine((p,c)=>{if(p.status==='published'&&(!p.content||!p.author))c.addIssue({code:'custom',message:'Published posts need article content and an author.'});});
export const escapeHtml = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function paragraphs(content){return content.split(/\n\s*\n/).map(p=>`<p>${escapeHtml(p).replace(/\n/g,'<br>')}</p>`).join('');}
export function metadata(post,site){
 const url=`${site}/blog/${post.slug}`;
 return {title:post.meta_title||post.title,description:post.meta_description||post.excerpt,url,
 schema:{'@context':'https://schema.org','@type':post.schema_type,headline:post.title,description:post.meta_description||post.excerpt,
 author:{'@type':'Person',name:post.author},datePublished:post.published_at,dateModified:post.updated_at,
 mainEntityOfPage:url,...(post.image?{image:[post.image]}:{})}};
}
