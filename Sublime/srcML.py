import sublime
import sublime_plugin
import time

import sys
print(sys.version)

from . import pylibsrcml

def run_xpath_get_regions(xpath,srcml,view):
    if xpath == "/":
        return []
    with pylibsrcml.srcMLArchiveRead(srcml) as iarchive:
        iarchive.append_transform_xpath(xpath)
        unit = iarchive.read_unit()
        try:
            result = iarchive.unit_apply_transforms(unit)
        except OSError as e:
            print(e)
            return []

    if result.get_type() != pylibsrcml.srcMLResult.UNITS:
        print("XPath returned 0 results")
        return []

    regions = []
    for unit in result:
        unit_text = str(unit)
        first_tag = unit_text[0:unit_text.find(">")]

        start, end = first_tag.split(" ")[-2:]

        start_row = int(start.split(":")[1].split('"')[1])-1
        start_col = int(start.split(":")[2].split('"')[0])-1
        end_row = int(end.split(":")[1].split('"')[1])-1
        end_col = int(end.split(":")[2].split('"')[0])
        reg = sublime.Region(view.text_point(start_row,start_col),
                             view.text_point(end_row,end_col))

        regions.append(reg)

    return regions

def run_srcql_get_regions(srcql, srcml, view):
    with pylibsrcml.srcMLArchiveRead(srcml) as iarchive:
        iarchive.append_transform_srcql(srcql)
        unit = iarchive.read_unit()
        try:
            result = iarchive.unit_apply_transforms(unit)
        except OSError as e:
            print(e)
            return []

    if result.get_type() != pylibsrcml.srcMLResult.UNITS:
        print("XPath returned 0 results")
        return []

    regions = []
    for unit in result:
        unit_text = str(unit)
        first_tag = unit_text[0:unit_text.find(">")]

        start, end = first_tag.split(" ")[-2:]

        start_row = int(start.split(":")[1].split('"')[1])-1
        start_col = int(start.split(":")[2].split('"')[0])-1
        end_row = int(end.split(":")[1].split('"')[1])-1
        end_col = int(end.split(":")[2].split('"')[0])
        reg = sublime.Region(view.text_point(start_row,start_col),
                             view.text_point(end_row,end_col))

        regions.append(reg)

    return regions




class SrcmlFindXpath(sublime_plugin.TextCommand):
    def run(self,_):
        self.src = self.view.substr(sublime.Region(0, self.view.size()))
        file_name = self.view.file_name().split("\\")[-1]
        file_type = pylibsrcml.check_extension(file_name)
        if(file_type == None):
            raise Exception("File type not supported by srcML")
        with pylibsrcml.srcMLArchiveWriteString() as archive:
            archive.disable_hash()
            archive.enable_solitary_unit()
            archive.enable_option(pylibsrcml.srcMLOption.POSITION)

            unit = archive.unit_create()
            unit.set_filename(file_name)
            unit.set_language(file_type)
            unit.parse_memory(self.src)

            archive.write_unit(unit)

            self.srcml = archive.close()

        self.view.window().show_input_panel("Find Next with XPath","",self.find,None,None)

    def find(self,xpath):
        selection = self.view.sel()
        current_point = max(selection[0].a,selection[0].b) if len(selection) > 0 else 0

        regions = run_xpath_get_regions(xpath,self.srcml,self.view)
        if len(regions) == 0:
            self.view.window().show_input_panel("Find Next with XPath",xpath,self.find,None,None)
            return
        i = 0
        while i < len(regions) and current_point > min(regions[i].a,regions[i].b):
            i += 1
        if i == len(regions):
            i = 0
        selection.clear()
        selection.add(regions[i])
        self.view.show(min(regions[i].a,regions[i].b))
        self.view.window().show_input_panel("Find Next with XPath",xpath,self.find,None,None)


class SrcmlUpdateHighlightXpath(sublime_plugin.TextCommand):
    def run(self,x,xpath,srcml):
        self.view.erase_regions("srcml")
        print("\nRun:",xpath)

        regions = run_xpath_get_regions(xpath,srcml,self.view)
        if len(regions) == 0:
            return

        self.view.add_regions(key="srcml",regions=regions,
            scope="region.yellowish",flags=0)

class SrcmlFindAllXpath(sublime_plugin.TextCommand):
    def run(self,_):
        self.src = self.view.substr(sublime.Region(0, self.view.size()))
        file_name = self.view.file_name().split("\\")[-1]
        file_type = pylibsrcml.check_extension(file_name)
        if(file_type == None):
            raise Exception("File type not supported by srcML")
        with pylibsrcml.srcMLArchiveWriteString() as archive:
            archive.disable_hash()
            archive.enable_solitary_unit()
            archive.enable_option(pylibsrcml.srcMLOption.POSITION)

            unit = archive.unit_create()
            unit.set_filename(file_name)
            unit.set_language(file_type)
            unit.parse_memory(self.src)

            archive.write_unit(unit)

            self.srcml = archive.close()
        self.view.window().show_input_panel("Find All with XPath","",self.find_all,self.update_highlighting,self.clear_highlighting)

    def update_highlighting(self,xpath):
        self.view.run_command("srcml_update_highlight_xpath",{"xpath":xpath,"srcml":self.srcml})

    def find_all(self,xpath):
        self.view.erase_regions("srcml")
        selection = self.view.sel()
        selection.clear()

        regions = run_xpath_get_regions(xpath,self.srcml,self.view)

        selection.add_all(regions)

    def clear_highlighting(self):
        self.view.erase_regions("srcml")




class SrcmlUpdateHighlightSrcql(sublime_plugin.TextCommand):
    def run(self,x,srcql,srcml):
        self.view.erase_regions("srcml")
        print("\nRun:",srcql)

        regions = run_srcql_get_regions(srcql,srcml,self.view)
        if len(regions) == 0:
            return

        self.view.add_regions(key="srcml",regions=regions,
            scope="region.yellowish",flags=0)

class SrcmlFindAllSrcql(sublime_plugin.TextCommand):
    def run(self,_):
        self.src = self.view.substr(sublime.Region(0, self.view.size()))
        file_name = self.view.file_name().split("\\")[-1]
        file_type = pylibsrcml.check_extension(file_name)
        if(file_type == None):
            raise Exception("File type not supported by srcML")
        with pylibsrcml.srcMLArchiveWriteString() as archive:
            archive.disable_hash()
            archive.enable_solitary_unit()
            archive.enable_option(pylibsrcml.srcMLOption.POSITION)

            unit = archive.unit_create()
            unit.set_filename(file_name)
            unit.set_language(file_type)
            unit.parse_memory(self.src)

            archive.write_unit(unit)

            self.srcml = archive.close()
        self.view.window().show_input_panel("Find All with srcQL","",self.find_all,self.update_highlighting,self.clear_highlighting)

    def update_highlighting(self,srcql):
        self.view.run_command("srcml_update_highlight_srcql",{"srcql":srcql,"srcml":self.srcml})

    def find_all(self,srcql):
        self.view.erase_regions("srcml")
        selection = self.view.sel()
        selection.clear()

        regions = run_srcql_get_regions(srcql,self.srcml,self.view)

        selection.add_all(regions)

    def clear_highlighting(self):
        self.view.erase_regions("srcml")




class SrcmlConvertToSrcml(sublime_plugin.TextCommand):
    def run(self,edit):
        print("!")
        self.src = self.view.substr(sublime.Region(0, self.view.size()))
        file_name = self.view.file_name().split("\\")[-1]
        file_type = pylibsrcml.check_extension(file_name)
        if(file_type == None):
            raise Exception("File type not supported by srcML")
        with pylibsrcml.srcMLArchiveWriteString() as archive:
            archive.disable_hash()
            archive.enable_solitary_unit()

            unit = archive.unit_create()
            unit.set_filename(file_name)
            unit.set_language(file_type)
            unit.parse_memory(self.src)

            archive.write_unit(unit)

            self.srcml = archive.close()
        new_view = self.view.window().new_file(sublime.NewFileFlags.ADD_TO_SELECTION,"")
        new_view.run_command('append', {"characters": self.srcml})



class SrcmlConvertFromSrcml(sublime_plugin.TextCommand):
    def run(self,edit):
        self.srcml = self.view.substr(sublime.Region(0, self.view.size()))
        self.src = ""
        with pylibsrcml.srcMLArchiveRead(self.srcml) as archive:
            archive.disable_hash()
            for unit in archive:
                self.src += unit.unparse_string() + "\n--------\n"

        new_view = self.view.window().new_file(sublime.NewFileFlags.ADD_TO_SELECTION,"")
        new_view.run_command('append', {"characters": self.src})
