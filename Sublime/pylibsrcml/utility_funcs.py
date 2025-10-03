# SPDX-License-Identifier: GPL-3.0-only
"""
@file utility_funcs.py

@copyright Copyright (C) 2014-2025 srcML, LLC. (www.srcML.org)

This file is part of pylibsrcml, a Python binding of libsrcml
"""

from .globals import libsrcml
from .exceptions import srcMLTypeError

def version_number() :
    """
    The current version of the srcml markup
    Return: Version of the srcml markup as a number
    """
    return libsrcml.srcml_version_number()

def version_string() :
    """
    The current version of the srcml markup
    Return: Version of the srcml markup as a string
    """
    return libsrcml.srcml_version_string().decode()

def markup_version_number(language: str) :
    """
    The current version of the srcml markup
    Parameter: language e
    Return: Version of the srcml markup as a number
    """
    if type(language) != str:
        raise srcMLTypeError(markup_version_number,"language",language)
    return libsrcml.srcml_markup_version_number(language.encode())

def markup_version_string(language: str) :
    """
    The current version of the srcml markup
    Parameter: language e
    Return: Version of the srcml markup as a string
    """
    if type(language) != str:
        raise srcMLTypeError(markup_version_number,"language",language)
    return libsrcml.srcml_markup_version_string(language.encode())

def libsrcml_version_number() :
    """
    The current version of the library
    Return: Version of libsrcml as a number
    """
    return libsrcml.srcml_libsrcml_version_number()

def libsrcml_version_string() :
    """
    The current version of the library
    Return: Version of libsrcml as a string
    """
    return libsrcml.srcml_libsrcml_version_string().decode()

def check_language(language: str) :
    """
    Checks if a source-code language is supported.
    Parameter: language g
    Return Value: pos e
    Return Value: 0 d
    """
    if type(language) != str:
        #raise TypeError(f"check_language requires a str (not {type(language)}")
        raise srcMLTypeError(check_language,"language",language)
    return libsrcml.srcml_check_language(language.encode())

def check_extension(filename: str) :
    """
    Check the current registered language for a file extension
    Parameter: filename d
    Return: The language name registered with that extension on success
    Return: None on failure
    """
    if type(filename) != str:
        raise srcMLTypeError(check_extension,"filename",filename)
    result = libsrcml.srcml_check_extension(filename.encode())
    return result.decode() if result else None

def get_language_list_size() :
    """
    Gets the number of supported source-code languages
    Return: The number of source-code languages supported
    """
    return libsrcml.srcml_get_language_list_size()

def get_language_from_list_pos(pos: int) :
    """
    Gets the name of the supported language at a given position
    Parameter: pos t
    Return: The name of the supported source-code language on success
    Return: NULL on failure
    """
    if type(pos) != int:
        raise srcMLTypeError(get_language_from_list_pos,"pos",pos)
    if pos < 0 or pos > get_language_list_size()-1:
        raise IndexError("Language index out of bounds")
    result = libsrcml.srcml_get_language_list(pos)
    return result.decode() if result else None

def get_language_list() :
    """
    Uses get_language_list_size and get_language_from_list_pos to return a
    list of languages
    """
    language_list = []
    for i in range(get_language_list_size()):
        language_list.append(get_language_from_list_pos(i))
    return language_list

def check_encoding(encoding: str) :
    """
    Check if a particular encoding is supported for input and output
    Parameter: encoding g
    """
    if type(encoding) != str:
        raise srcMLTypeError(check_encoding,"encoding",encoding)
    return libsrcml.srcml_check_encoding(encoding.encode())

def check_xslt() :
    """
    Check if XSLT is available
    Return Value: 1 e
    Return Value: 0 e
    """
    return libsrcml.srcml_check_xslt()

def check_exslt() :
    """
    Check if EXSLT is available
    Return Value: 1 e
    Return Value: 0 e
    """
    return libsrcml.srcml_check_exslt()

def error_string() :
    """
    Provides a description of the last error to occur
    Return: A string describing last recorded error
    """
    result = libsrcml.srcml_error_string()
    return result.decode() if result else None
