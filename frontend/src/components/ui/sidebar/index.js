/**
 * Composable sidebar components.
 *
 * Architecture mirrors shadcn/ui sidebar patterns adapted for vanilla React.
 *
 * Usage:
 *   <Sidebar collapsed={collapsed} onToggle={toggleSidebar}>
 *     <SidebarHeader>…</SidebarHeader>
 *     <SidebarContent>
 *       <SidebarGroup>…</SidebarGroup>
 *     </SidebarContent>
 *     <SidebarFooter>…</SidebarFooter>
 *   </Sidebar>
 *
 * Sub-components:
 *   SidebarHeader, SidebarContent, SidebarFooter
 *   SidebarGroup, SidebarMenu, SidebarMenuItem
 */

export { SidebarProvider, useSidebar } from './SidebarProvider';
export { SidebarHeader, SidebarContent, SidebarFooter } from './SidebarComponents';
export { SidebarGroup, SidebarGroupLabel } from './SidebarGroup';
export { SidebarMenu, SidebarMenuItem } from './SidebarMenu';
export { SidebarMenuButton } from './SidebarMenuButton';
